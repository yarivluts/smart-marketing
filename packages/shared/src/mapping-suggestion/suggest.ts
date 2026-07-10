import { castMappingValue } from '../mapping-engine';
import { flattenSamplePayload, type FlattenedSourcePath } from './flatten';
import type { MappingSuggestion, MappingSuggestionTargetField } from './types';

/**
 * A target field name is always either a bare envelope field (`event_id`, `ts`, ...) or
 * `<container>.<name>` (`properties.order_id`, ...) — see `mapping-engine/engine.ts`'s
 * `CONTAINER_FIELD_BY_KIND`. The container prefix is structural, not part of what the field
 * *means*, so it's stripped before comparing names; this list is a deliberate, independent mirror
 * of `CONTAINER_FIELD_BY_KIND`'s three values (closed and unlikely to change), the same
 * "mirror without depending on it" posture this module's sibling types already establish.
 */
const KNOWN_TARGET_CONTAINERS = ['properties', 'attributes', 'dimensions'];

function stripContainerPrefix(targetField: string): string {
  for (const container of KNOWN_TARGET_CONTAINERS) {
    if (targetField.startsWith(`${container}.`)) {
      return targetField.slice(container.length + 1);
    }
  }
  return targetField;
}

function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function leafSegment(path: string): string {
  const segments = path.replace(/\[\d+\]/g, '').split('.');
  return segments[segments.length - 1] ?? path;
}

/** A small, curated set of concept synonyms — real value comes from a real LLM someday (see this module's doc comment); until then this closes the gap on the handful of field concepts that recur across most webhook payloads (a timestamp, an id, a money amount) but rarely share the target's exact wording. */
const SYNONYM_TOKENS: Readonly<Record<string, readonly string[]>> = {
  ts: ['time', 'timestamp', 'date', 'at', 'created', 'updated', 'occurred', 'when'],
  id: ['identifier', 'uuid', 'key', 'ref', 'reference'],
  amount: ['price', 'total', 'value', 'sum', 'cost'],
  value: ['amount', 'price', 'total', 'sum'],
  email: ['mail'],
  status: ['state'],
  name: ['title'],
};

function jaccard(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

function synonymBonus(targetTokens: readonly string[], sourceTokens: readonly string[]): number {
  const expansions = new Set(targetTokens.flatMap((token) => SYNONYM_TOKENS[token] ?? []));
  if (expansions.size === 0) {
    return 0;
  }
  const hits = sourceTokens.filter((token) => expansions.has(token)).length;
  return Math.min(0.3, hits * 0.2);
}

/** How well `sourcePath` reads as a candidate for a target field named (post-container-strip) `targetName`, 0..1. Pure name/token similarity — no notion of the values involved. */
function nameSimilarity(targetName: string, sourcePath: string): number {
  const targetTokens = tokenize(targetName);
  const sourceTokens = tokenize(sourcePath);
  const targetNormalized = normalize(targetName);
  const sourceLeafNormalized = normalize(leafSegment(sourcePath));

  const base = jaccard(targetTokens, sourceTokens) * 0.6;
  const exactLeafMatch = targetNormalized.length > 0 && targetNormalized === sourceLeafNormalized ? 0.5 : 0;
  const containment =
    exactLeafMatch === 0 &&
    targetNormalized.length > 0 &&
    sourceLeafNormalized.length > 0 &&
    (targetNormalized.includes(sourceLeafNormalized) || sourceLeafNormalized.includes(targetNormalized))
      ? 0.15
      : 0;
  const synonym = synonymBonus(targetTokens, sourceTokens);

  return Math.min(1, base + exactLeafMatch + containment + synonym);
}

/** Whether (and how) `value` can populate a field of `targetType` — `rename` when its own JS type already matches, `cast` when `castMappingValue` (the same coercion a saved `cast` rule performs at apply-time) can convert it, `null` when neither holds. */
function candidateTransform(
  value: string | number | boolean,
  targetType: MappingSuggestionTargetField['type'],
): { transform: 'rename' | 'cast'; castType?: MappingSuggestionTargetField['type'] } | null {
  const exactMatch =
    (targetType === 'string' && typeof value === 'string') ||
    (targetType === 'number' && typeof value === 'number') ||
    (targetType === 'boolean' && typeof value === 'boolean');
  if (exactMatch) {
    return { transform: 'rename' };
  }
  const cast = castMappingValue(value, targetType);
  return cast.ok ? { transform: 'cast', castType: targetType } : null;
}

/**
 * Proposes a `rename`/`cast` rule for each target field from one sample payload (KAN-55 AC: "LLM
 * proposes field mapping from sample payload; user confirms"). This proposer is a deterministic
 * name/type-similarity heuristic — a buildable-today stand-in for a real LLM call, the same
 * "provider-agnostic, real backend deferred" posture `NotConfiguredWarehouseQueryExecutor`
 * (KAN-42) and `LocalKmsProvider` (KAN-29) establish for their own external dependencies. Every
 * suggestion is proposed only, never auto-applied — the admin UI's "user confirms" step is the same
 * regardless of which proposer produced the suggestion.
 *
 * For each target field, every scalar leaf in the sample is scored on name similarity to the
 * target's own name (ignoring the envelope container prefix) and filtered to only those whose value
 * can actually populate the target's type (`rename` if it already matches, `cast` if coercible); the
 * single best-scoring candidate is proposed, and only if its score clears `minConfidence`. A field
 * with no acceptable candidate is simply left out — proposing a wrong guess is worse than proposing
 * nothing, since the whole point is a confirm step the user should be able to trust at a glance.
 */
export function suggestFieldMappingRules(
  targetFields: readonly MappingSuggestionTargetField[],
  samplePayload: unknown,
  minConfidence = 0.2,
): MappingSuggestion[] {
  const sourcePaths = flattenSamplePayload(samplePayload);
  const suggestions: MappingSuggestion[] = [];

  for (const target of targetFields) {
    const targetName = stripContainerPrefix(target.targetField);
    let best: { source: FlattenedSourcePath; score: number; transform: 'rename' | 'cast'; castType?: MappingSuggestionTargetField['type'] } | null =
      null;

    for (const source of sourcePaths) {
      const transformInfo = candidateTransform(source.value, target.type);
      if (!transformInfo) {
        continue;
      }
      const score = nameSimilarity(targetName, source.path);
      if (!best || score > best.score) {
        best = { source, score, ...transformInfo };
      }
    }

    if (!best) {
      continue;
    }
    const confidence = Math.round(best.score * 100) / 100;
    if (confidence < minConfidence) {
      continue;
    }
    suggestions.push({
      targetField: target.targetField,
      transform: best.transform,
      sourcePath: best.source.path,
      ...(best.castType ? { castType: best.castType } : {}),
      confidence,
    });
  }

  return suggestions;
}
