import type { SegmentFilterCondition } from '../segments';
import type { SegmentSuggestion, SegmentSuggestionFieldDescriptor, SegmentSuggestionFieldType } from './types';

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

/** A short keyword (e.g. `"plan"`) is allowed to match a whole token exactly, but only a longer keyword is allowed to match as a bare substring of the field's normalized name — the same `funnel-suggestion`/`proposeFunnelSteps` reasoning for its own `MIN_SUBSTRING_KEYWORD_LENGTH`. */
const MIN_SUBSTRING_KEYWORD_LENGTH = 6;

/**
 * How well `fieldName` reads as a match for one concept's keyword lexicon,
 * 0..1 — the same three-tier scorer `funnel-suggestion`'s `matchStage`
 * establishes (exact-token match on the field's own last token scores
 * highest, a keyword found anywhere among the field's tokens scores next,
 * a long keyword found as a substring of the fully-normalized name scores
 * lowest but still counts), independently duplicated here rather than
 * imported since each proposer's field-vs-token semantics differ slightly.
 */
function scoreFieldAgainstKeywords(fieldName: string, keywords: readonly string[]): number {
  const tokens = tokenize(fieldName);
  const tokenSet = new Set(tokens);
  const lastToken = tokens[tokens.length - 1];
  const normalized = normalize(fieldName);

  let score = 0;
  for (const keyword of keywords) {
    if (keyword === lastToken) {
      score = Math.max(score, 1);
    } else if (tokenSet.has(keyword)) {
      score = Math.max(score, 0.85);
    } else if (keyword.length >= MIN_SUBSTRING_KEYWORD_LENGTH && normalized.includes(keyword)) {
      score = Math.max(score, 0.7);
    }
  }
  return score;
}

function isoOffsetFromNow(now: Date, days: number): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

interface SegmentSuggestionConcept {
  /** Every keyword is a single, already-lowercased token or compound (no separators) — see {@link scoreFieldAgainstKeywords}. */
  keywords: readonly string[];
  allowedTypes: readonly SegmentSuggestionFieldType[];
  buildFilter: (field: SegmentSuggestionFieldDescriptor, now: Date) => SegmentFilterCondition;
}

interface SegmentSuggestionArchetype {
  name: string;
  /** ANDed together — every concept must find an acceptable field, or the whole archetype is dropped (a segment suggestion is a complete, ready-to-save definition, not a partial one the user has to finish building). */
  concepts: readonly SegmentSuggestionConcept[];
}

/**
 * A small, curated library of common marketing/SaaS list archetypes (plan
 * `14 §Gap 9`'s own examples: "customers who churned", "high-value trial
 * users about to expire") — each expressed as one or more field *concepts*
 * matched against the target entity schema's own declared fields, the same
 * "curated lexicon, not a real model" posture `funnel-suggestion`'s own
 * `FUNNEL_STAGES` table establishes. Threshold values (30-day churn/inactive
 * windows, the $100 high-value floor, the 7-day trial-expiry/signup windows)
 * are deliberately round, easy-to-recognize defaults — the suggestion is
 * proposed into the same editable filter-row form a hand-built segment uses,
 * so the user can freely retune any value before saving.
 */
const SEGMENT_SUGGESTION_ARCHETYPES: readonly SegmentSuggestionArchetype[] = [
  {
    name: 'Recently churned customers',
    concepts: [
      {
        keywords: ['churn', 'churned', 'cancel', 'cancelled', 'canceled', 'deactivated', 'deactivation'],
        allowedTypes: ['timestamp', 'boolean'],
        buildFilter: (field, now) =>
          field.type === 'boolean' ? { field: field.name, op: '=', value: true } : { field: field.name, op: '>=', value: isoOffsetFromNow(now, -30) },
      },
    ],
  },
  {
    name: 'Trial users expiring soon',
    concepts: [
      {
        keywords: ['plan', 'tier'],
        allowedTypes: ['string'],
        buildFilter: (field) => ({ field: field.name, op: '=', value: 'trial' }),
      },
      {
        keywords: ['trialend', 'trialexpire', 'trialexpiry', 'trialexpires', 'trialendsat'],
        allowedTypes: ['timestamp'],
        buildFilter: (field, now) => ({ field: field.name, op: '<=', value: isoOffsetFromNow(now, 7) }),
      },
    ],
  },
  {
    name: 'High-value customers',
    concepts: [
      {
        keywords: ['mrr', 'arr', 'revenue', 'ltv', 'spend'],
        allowedTypes: ['number'],
        buildFilter: (field) => ({ field: field.name, op: '>=', value: 100 }),
      },
    ],
  },
  {
    name: 'Inactive customers',
    concepts: [
      {
        keywords: ['lastactive', 'lastseen', 'lastlogin', 'lastactivity'],
        allowedTypes: ['timestamp'],
        buildFilter: (field, now) => ({ field: field.name, op: '<', value: isoOffsetFromNow(now, -30) }),
      },
    ],
  },
  {
    name: 'New signups this week',
    concepts: [
      {
        keywords: ['signup', 'signedup', 'createdat', 'joinedat'],
        allowedTypes: ['timestamp'],
        buildFilter: (field, now) => ({ field: field.name, op: '>=', value: isoOffsetFromNow(now, -7) }),
      },
    ],
  },
];

interface ConceptMatch {
  concept: SegmentSuggestionConcept;
  field: SegmentSuggestionFieldDescriptor;
  score: number;
}

/** The single best-scoring field for one concept among `fieldDefs` — ties keep the first occurrence, the same "stable, first-in-list wins" tie-break `suggestFieldMappingRules`'s own best-candidate search establishes. */
function bestFieldForConcept(fieldDefs: readonly SegmentSuggestionFieldDescriptor[], concept: SegmentSuggestionConcept): { field: SegmentSuggestionFieldDescriptor; score: number } | null {
  let best: { field: SegmentSuggestionFieldDescriptor; score: number } | null = null;
  for (const field of fieldDefs) {
    if (!concept.allowedTypes.includes(field.type)) {
      continue;
    }
    const score = scoreFieldAgainstKeywords(field.name, concept.keywords);
    if (score > 0 && (!best || score > best.score)) {
      best = { field, score };
    }
  }
  return best;
}

function evaluateArchetype(
  archetype: SegmentSuggestionArchetype,
  fieldDefs: readonly SegmentSuggestionFieldDescriptor[],
  now: Date,
  minConfidence: number,
): SegmentSuggestion | null {
  const matches: ConceptMatch[] = [];
  for (const concept of archetype.concepts) {
    const match = bestFieldForConcept(fieldDefs, concept);
    if (!match) {
      return null;
    }
    matches.push({ concept, ...match });
  }

  const confidence = Math.round(Math.min(...matches.map((match) => match.score)) * 100) / 100;
  if (confidence < minConfidence) {
    return null;
  }

  return {
    name: archetype.name,
    filters: matches.map((match) => match.concept.buildFilter(match.field, now)),
    confidence,
  };
}

export interface SuggestSegmentCandidatesOptions {
  /**
   * A suggestion is dropped if its confidence (the weakest of its matched
   * concepts) falls below this — the same "propose nothing over a wrong
   * guess" posture `suggestFieldMappingRules`'s own `minConfidence`
   * establishes. `scoreFieldAgainstKeywords` only ever produces `0` (no
   * match — already excluded by `bestFieldForConcept`), `0.7` (substring
   * match), `0.85` (whole-token match), or `1` (last-token match), so the
   * default of `0.5` doesn't filter anything beyond that "no match at all"
   * case; raise it above `0.7` to require at least a whole-token hit, or
   * above `0.85` to require an exact last-token match.
   */
  minConfidence?: number;
  /** Injectable so callers/tests get deterministic date-relative filter values (e.g. "canceled in the last 30 days") without depending on wall-clock time. Defaults to `new Date()`. */
  now?: Date;
}

/**
 * Proposes candidate segment definitions for one entity schema's declared
 * fields (KAN-81, E14.x, plan `14 §Gap 9` "AI-suggested lists") — a
 * deterministic field-name/type heuristic against {@link
 * SEGMENT_SUGGESTION_ARCHETYPES}, the same "buildable-today stand-in for a
 * real LLM call" posture `suggestFieldMappingRules` (KAN-55) and
 * `proposeFunnelSteps` (KAN-68) already establish for their own proposers.
 * Every suggestion is proposed only — the caller still creates the segment
 * through the existing `createSegment` confirm step.
 *
 * Sorted by confidence descending, ties broken alphabetically by name.
 */
export function suggestSegmentCandidates(fieldDefs: readonly SegmentSuggestionFieldDescriptor[], options?: SuggestSegmentCandidatesOptions): SegmentSuggestion[] {
  const now = options?.now ?? new Date();
  const minConfidence = options?.minConfidence ?? 0.5;

  const suggestions: SegmentSuggestion[] = [];
  for (const archetype of SEGMENT_SUGGESTION_ARCHETYPES) {
    const suggestion = evaluateArchetype(archetype, fieldDefs, now, minConfidence);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  return suggestions.sort((a, b) => (b.confidence !== a.confidence ? b.confidence - a.confidence : a.name.localeCompare(b.name)));
}
