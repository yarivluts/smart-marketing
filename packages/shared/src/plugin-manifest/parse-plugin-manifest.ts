import { parse as parseYaml, YAMLParseError } from 'yaml';
import {
  isPluginConfigFieldType,
  isPluginScope,
  isPluginType,
  PluginManifestValidationError,
  type PluginConfigFieldSchema,
  type PluginManifest,
  type PluginManifestEndpoints,
  type PluginManifestRegisters,
} from './types';

/** `com.example.shopify-pack` — at least two dot-separated, lowercase-alnum(-hyphen) segments. */
const MANIFEST_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

/** `major.minor.patch`, e.g. `1.2.0` — the shape plan `12 §5`'s own example uses. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function validateScopes(raw: unknown, reasons: string[]): PluginManifest['scopes'] {
  if (!isStringArray(raw) || raw.length === 0) {
    reasons.push('`scopes` must be a non-empty array of strings.');
    return [];
  }
  const seen = new Set<string>();
  const scopes: PluginManifest['scopes'][number][] = [];
  for (const scope of raw) {
    if (seen.has(scope)) {
      reasons.push(`Scope "${scope}" is declared more than once.`);
      continue;
    }
    seen.add(scope);
    if (!isPluginScope(scope)) {
      reasons.push(`Unknown scope "${scope}".`);
      continue;
    }
    scopes.push(scope);
  }
  return scopes;
}

function validateConfigSchema(raw: unknown, reasons: string[]): Record<string, PluginConfigFieldSchema> {
  if (raw === undefined) {
    return {};
  }
  if (!isRecord(raw)) {
    reasons.push('`config_schema` must be a map of field name to `{ type, required? }`.');
    return {};
  }
  const configSchema: Record<string, PluginConfigFieldSchema> = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (!isRecord(entry) || typeof entry.type !== 'string') {
      reasons.push(`config_schema field "${name}" must declare a string \`type\`.`);
      continue;
    }
    if (!isPluginConfigFieldType(entry.type)) {
      reasons.push(`config_schema field "${name}" has an unknown type "${entry.type}".`);
      continue;
    }
    if (entry.required !== undefined && typeof entry.required !== 'boolean') {
      reasons.push(`config_schema field "${name}"'s \`required\` must be a boolean.`);
      continue;
    }
    configSchema[name] = { type: entry.type, required: entry.required ?? false };
  }
  return configSchema;
}

function validateStringList(raw: unknown, fieldPath: string, reasons: string[]): string[] {
  if (raw === undefined) {
    return [];
  }
  if (!isStringArray(raw)) {
    reasons.push(`\`${fieldPath}\` must be an array of strings.`);
    return [];
  }
  return raw;
}

function validateRegisters(raw: unknown, reasons: string[]): PluginManifestRegisters {
  if (raw === undefined) {
    return { entities: [], events: [], metrics: [] };
  }
  if (!isRecord(raw)) {
    reasons.push('`registers` must be a map with optional `entities`/`events`/`metrics` arrays.');
    return { entities: [], events: [], metrics: [] };
  }
  return {
    entities: validateStringList(raw.entities, 'registers.entities', reasons),
    events: validateStringList(raw.events, 'registers.events', reasons),
    metrics: validateStringList(raw.metrics, 'registers.metrics', reasons),
  };
}

function validateEndpoints(raw: unknown, reasons: string[]): PluginManifestEndpoints {
  if (raw === undefined) {
    return {};
  }
  if (!isRecord(raw)) {
    reasons.push('`endpoints` must be a map with optional `sync`/`action` string paths.');
    return {};
  }
  const endpoints: PluginManifestEndpoints = {};
  if (raw.sync !== undefined) {
    if (typeof raw.sync !== 'string' || raw.sync.trim().length === 0) {
      reasons.push('`endpoints.sync` must be a non-empty string.');
    } else {
      endpoints.sync = raw.sync;
    }
  }
  if (raw.action !== undefined) {
    if (typeof raw.action !== 'string' || raw.action.trim().length === 0) {
      reasons.push('`endpoints.action` must be a non-empty string.');
    } else {
      endpoints.action = raw.action;
    }
  }
  return endpoints;
}

/**
 * Parses and validates a `plugin.yaml` document (plan `08 §4`/`12 §5`) into a
 * {@link PluginManifest}. Collects every violation before throwing (rather
 * than failing on the first) — the same "report every reason at once"
 * posture `schema-registry.service.ts`'s `validateFields` uses — so a plugin
 * author fixing a manifest doesn't have to re-submit once per mistake.
 */
export function parsePluginManifest(manifestYaml: string): PluginManifest {
  let parsed: unknown;
  try {
    parsed = parseYaml(manifestYaml);
  } catch (err) {
    const message = err instanceof YAMLParseError ? err.message : 'Could not parse the document as YAML.';
    throw new PluginManifestValidationError([`Invalid YAML: ${message}`]);
  }

  if (!isRecord(parsed)) {
    throw new PluginManifestValidationError(['A plugin manifest must be a YAML map at its root.']);
  }

  const reasons: string[] = [];

  let id = '';
  if (typeof parsed.id !== 'string' || parsed.id.trim().length === 0) {
    reasons.push('`id` is required and must be a non-empty string.');
  } else if (!MANIFEST_ID_PATTERN.test(parsed.id)) {
    reasons.push(`\`id\` "${parsed.id}" must be a reverse-DNS-style identifier, e.g. "com.example.shopify-pack".`);
  } else {
    id = parsed.id;
  }

  let version = '';
  if (typeof parsed.version !== 'string' || parsed.version.trim().length === 0) {
    reasons.push('`version` is required and must be a non-empty string.');
  } else if (!SEMVER_PATTERN.test(parsed.version)) {
    reasons.push(`\`version\` "${parsed.version}" must be semver \`major.minor.patch\`, e.g. "1.2.0".`);
  } else {
    version = parsed.version;
  }

  let type: PluginManifest['type'] = 'source';
  if (typeof parsed.type !== 'string') {
    reasons.push('`type` is required and must be a string.');
  } else if (!isPluginType(parsed.type)) {
    reasons.push(`Unknown \`type\` "${parsed.type}".`);
  } else {
    type = parsed.type;
  }

  let displayName = '';
  if (typeof parsed.display_name !== 'string' || parsed.display_name.trim().length === 0) {
    reasons.push('`display_name` is required and must be a non-empty string.');
  } else {
    displayName = parsed.display_name;
  }

  const scopes = validateScopes(parsed.scopes, reasons);
  const configSchema = validateConfigSchema(parsed.config_schema, reasons);
  const registers = validateRegisters(parsed.registers, reasons);
  const endpoints = validateEndpoints(parsed.endpoints, reasons);

  if (reasons.length > 0) {
    throw new PluginManifestValidationError(reasons);
  }

  return { id, version, type, displayName, scopes, configSchema, registers, endpoints };
}
