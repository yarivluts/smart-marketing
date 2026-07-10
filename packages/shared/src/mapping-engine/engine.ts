import { extractJsonPathValue, parseJsonPath } from './json-path';
import { castMappingValue, renderTemplate, templatePlaceholderPaths } from './transforms';
import {
  isMappingCastType,
  isMappingRuleTransform,
  MAPPING_CAST_TYPES,
  type MappingApplyResult,
  type MappingCastType,
  type MappingRecordKind,
  type MappingRule,
  type MappingRuleInput,
} from './types';

/** The schema-validated bag each kind's mapped record nests non-envelope fields under — matches `ingest.service.ts`'s `checkRecordEnvelope` (`properties`/`attributes`/`dimensions`). */
const CONTAINER_FIELD_BY_KIND: Record<MappingRecordKind, string> = {
  event: 'properties',
  entity: 'attributes',
  measure: 'dimensions',
};

/** The top-level envelope fields `ingest.service.ts`'s `checkRecordEnvelope` requires per kind — every one of these must have a mapping rule for a mapping to be saveable. */
const ENVELOPE_FIELDS_BY_KIND: Record<MappingRecordKind, readonly string[]> = {
  event: ['event_id', 'event', 'ts'],
  entity: ['id'],
  measure: ['measure', 'ts', 'value'],
};

/** Each envelope field's own fixed type — unlike a schema field's type, this never varies by project, since it's part of `ingest.service.ts`'s envelope shape itself rather than anything project-registered. */
const ENVELOPE_FIELD_TYPES_BY_KIND: Record<MappingRecordKind, Readonly<Record<string, MappingCastType>>> = {
  event: { event_id: 'string', event: 'string', ts: 'timestamp' },
  entity: { id: 'string' },
  measure: { measure: 'string', ts: 'timestamp', value: 'number' },
};

/** One field a mapping of a given kind needs a rule for, alongside the type a rule targeting it must ultimately produce. */
export interface MappingTargetFieldDescriptor {
  targetField: string;
  type: MappingCastType;
  required: boolean;
}

/**
 * Every field a mapping of `kind` needs a rule for: the kind's fixed envelope fields, plus the
 * target schema's own registered fields (nested under the kind's container, e.g.
 * `properties.order_id`). Centralizes the envelope-shape knowledge `validateMappingRules` already
 * has so callers that need the *full* target-field list — e.g. KAN-55's mapping-suggestion feature —
 * don't have to duplicate `ENVELOPE_FIELDS_BY_KIND`/`CONTAINER_FIELD_BY_KIND` themselves.
 */
export function mappingTargetFields(
  kind: MappingRecordKind,
  schemaFields: readonly { name: string; type: MappingCastType; is_required: boolean }[],
): MappingTargetFieldDescriptor[] {
  const container = CONTAINER_FIELD_BY_KIND[kind];
  const envelopeFields = ENVELOPE_FIELDS_BY_KIND[kind].map((name) => ({
    targetField: name,
    type: ENVELOPE_FIELD_TYPES_BY_KIND[kind][name],
    required: true,
  }));
  const schemaTargetFields = schemaFields.map((field) => ({
    targetField: `${container}.${field.name}`,
    type: field.type,
    required: field.is_required,
  }));
  return [...envelopeFields, ...schemaTargetFields];
}

/** Assigns `value` at `targetField` in `record` — a bare name (an envelope field) sets it directly; a `container.name` name nests it under `container`, creating the bucket on first use. Only one level of nesting is supported, matching every `SchemaFieldDef` being flat. */
function setTargetField(record: Record<string, unknown>, targetField: string, value: unknown): void {
  const dotIndex = targetField.indexOf('.');
  if (dotIndex === -1) {
    record[targetField] = value;
    return;
  }
  const container = targetField.slice(0, dotIndex);
  const field = targetField.slice(dotIndex + 1);
  const existing = record[container];
  const bucket = existing !== null && typeof existing === 'object' && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {};
  bucket[field] = value;
  record[container] = bucket;
}

type RuleOutcome = { value: unknown; error?: undefined } | { value?: undefined; error: string };

function applyRule(rule: MappingRule, payload: unknown): RuleOutcome {
  switch (rule.transform) {
    case 'static':
      return { value: rule.staticValue ?? '' };
    case 'template': {
      const rendered = renderTemplate(rule.template ?? '', payload);
      if (!rendered.ok) {
        return { error: `template_placeholder_missing:${rendered.error.join(',')}` };
      }
      return { value: rendered.value };
    }
    case 'rename': {
      const extracted = extractJsonPathValue(payload, rule.sourcePath ?? '');
      if (!extracted.ok) {
        return { error: extracted.error };
      }
      return { value: extracted.value };
    }
    case 'cast': {
      const extracted = extractJsonPathValue(payload, rule.sourcePath ?? '');
      if (!extracted.ok) {
        return { error: extracted.error };
      }
      const cast = castMappingValue(extracted.value, rule.castType ?? 'string');
      if (!cast.ok) {
        return { error: cast.error };
      }
      return { value: cast.value };
    }
  }
}

/**
 * Applies a saved mapping's rules to one raw payload (KAN-54 AC: "test-run on
 * sample"), producing the same envelope shape `ingest.service.ts`'s
 * `IngestBatchInput` records expect. Never throws: a rule whose source path
 * is missing, whose cast fails, or whose template has an unresolved
 * placeholder is reported per-field in `errors` rather than aborting the
 * whole mapping, so a test-run against a real sample shows exactly which
 * fields still need fixing rather than an opaque failure.
 */
export function applyFieldMapping(rules: readonly MappingRule[], payload: unknown): MappingApplyResult {
  const record: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const rule of rules) {
    const outcome = applyRule(rule, payload);
    if (outcome.error) {
      errors.push(`${rule.targetField}:${outcome.error}`);
      continue;
    }
    setTargetField(record, rule.targetField, outcome.value);
  }
  return { record, errors };
}

export interface ValidatedMappingRules {
  rules: MappingRule[];
  reasons: string[];
}

/**
 * Structural validation for a mapping before it's saved — mirrors
 * `schema-registry.service.ts`'s `validateFields`. Checks: every rule
 * targets a valid field for `kind` (one of its envelope fields, or
 * `<container>.<name>`); no field is targeted twice; every transform carries
 * the config it needs (a `sourcePath` for rename/cast, a `castType` for
 * cast, a `template` for template, a `staticValue` for static); every
 * `sourcePath`/template placeholder parses as a JSONPath; and every one of
 * the kind's required envelope fields has a rule. Returns the typed, trimmed
 * rules alongside any violations rather than throwing — the caller (the save
 * path) decides whether to reject.
 */
export function validateMappingRules(kind: MappingRecordKind, rules: readonly MappingRuleInput[]): ValidatedMappingRules {
  const reasons: string[] = [];
  if (rules.length === 0) {
    reasons.push('A mapping must declare at least one rule.');
  }

  const container = CONTAINER_FIELD_BY_KIND[kind];
  const envelopeFields = new Set(ENVELOPE_FIELDS_BY_KIND[kind]);
  const seenTargets = new Set<string>();
  const typedRules: MappingRule[] = [];

  for (const rule of rules) {
    const targetField = rule.targetField.trim();
    if (targetField.length === 0) {
      reasons.push('Every rule must target a non-empty field.');
      continue;
    }
    if (seenTargets.has(targetField)) {
      reasons.push(`Field "${targetField}" is mapped more than once.`);
    }
    seenTargets.add(targetField);

    const isEnvelopeField = envelopeFields.has(targetField);
    const isContainerField = targetField.startsWith(`${container}.`) && targetField.length > container.length + 1;
    if (!isEnvelopeField && !isContainerField) {
      reasons.push(
        `Field "${targetField}" is not valid for kind "${kind}" (expected one of ${[...envelopeFields].join(', ')}, or "${container}.<name>").`,
      );
    }

    if (!isMappingRuleTransform(rule.transform)) {
      reasons.push(`Field "${targetField}" has an unknown transform "${rule.transform}".`);
      continue;
    }

    if (rule.transform === 'rename' || rule.transform === 'cast') {
      if (!rule.sourcePath?.trim()) {
        reasons.push(`Field "${targetField}": "${rule.transform}" requires a sourcePath.`);
      } else if (!parseJsonPath(rule.sourcePath).ok) {
        reasons.push(`Field "${targetField}": sourcePath "${rule.sourcePath}" is not a valid JSONPath.`);
      }
    }
    const castType = rule.transform === 'cast' && rule.castType && isMappingCastType(rule.castType) ? rule.castType : undefined;
    if (rule.transform === 'cast' && !castType) {
      reasons.push(`Field "${targetField}": "cast" requires a valid castType (one of ${MAPPING_CAST_TYPES.join(', ')}).`);
    }
    if (rule.transform === 'template') {
      if (!rule.template?.trim()) {
        reasons.push(`Field "${targetField}": "template" requires a non-empty template.`);
      } else {
        for (const placeholderPath of templatePlaceholderPaths(rule.template)) {
          if (!parseJsonPath(placeholderPath).ok) {
            reasons.push(`Field "${targetField}": template placeholder "${placeholderPath}" is not a valid JSONPath.`);
          }
        }
      }
    }
    if (rule.transform === 'static' && rule.staticValue === undefined) {
      reasons.push(`Field "${targetField}": "static" requires a staticValue.`);
    }

    // Only the keys a rule's own transform actually uses are included — never
    // an explicit `key: undefined` — since a `MappingRule` round-trips
    // through Firestore (`FieldMappingModel.rules`) once saved, and the
    // Firestore client SDK rejects `undefined` anywhere in a document tree,
    // including nested inside an array element.
    const sourcePath = rule.sourcePath?.trim() || undefined;
    typedRules.push({
      targetField,
      transform: rule.transform,
      ...(sourcePath !== undefined ? { sourcePath } : {}),
      ...(castType !== undefined ? { castType } : {}),
      ...(rule.template !== undefined ? { template: rule.template } : {}),
      ...(rule.staticValue !== undefined ? { staticValue: rule.staticValue } : {}),
    });
  }

  for (const required of envelopeFields) {
    if (!seenTargets.has(required)) {
      reasons.push(`Required field "${required}" has no mapping rule.`);
    }
  }

  return { rules: typedRules, reasons };
}
