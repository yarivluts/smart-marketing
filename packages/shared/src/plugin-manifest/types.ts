/**
 * Types for the plugin manifest (KAN-46, plan `08 §4`/`12 §5`): pure,
 * Firestore-free — `parsePluginManifest` turns a `plugin.yaml` document into
 * this shape, and `@growthos/firebase-orm-models`'s `plugin-registry.service`
 * is the only thing that persists it. Kept independent of any specific ORM
 * model type, the same split `metrics-compiler` uses, so a manifest can be
 * parsed/validated without an emulator.
 */

/** Plugin types plan `08 §4`'s table enumerates. */
export const PLUGIN_TYPES = ['source', 'mapping', 'transform', 'metric_pack', 'action', 'ai_tool', 'panel'] as const;
export type PluginType = (typeof PLUGIN_TYPES)[number];

export function isPluginType(value: string): value is PluginType {
  return (PLUGIN_TYPES as readonly string[]).includes(value);
}

/**
 * Least-privilege scope vocabulary a manifest's `scopes` list may draw from
 * (plan `12 §5`'s own example: `[ingest:write, schema:write]`). Deliberately
 * a separate, smaller, colon-namespaced vocabulary from `@growthos/shared`'s
 * own dot-namespaced `PERMISSIONS` catalog: a plugin scope describes what a
 * *plugin* may do inside a project once installed (a narrower, sandboxed
 * grant a project admin consents to per-install), not what a *human role*
 * may do across the product — the two are related but not the same list,
 * the same reasoning `API_KEY_SCOPES` already applies one level up. Curated
 * to cover at least one capability per `PLUGIN_TYPES` entry; extend as real
 * plugins (KAN-47+) need more.
 */
export const PLUGIN_SCOPES = [
  'ingest:write',
  'schema:write',
  'metrics:write',
  'dashboards:write',
  'action:execute',
  'ai:tool',
] as const;
export type PluginScope = (typeof PLUGIN_SCOPES)[number];

export function isPluginScope(value: string): value is PluginScope {
  return (PLUGIN_SCOPES as readonly string[]).includes(value);
}

/** Primitive types a `config_schema` entry may declare — enough to render/validate a basic install form; richer shapes are KAN-48's "config forms" concern. */
export const PLUGIN_CONFIG_FIELD_TYPES = ['string', 'number', 'boolean'] as const;
export type PluginConfigFieldType = (typeof PLUGIN_CONFIG_FIELD_TYPES)[number];

export function isPluginConfigFieldType(value: string): value is PluginConfigFieldType {
  return (PLUGIN_CONFIG_FIELD_TYPES as readonly string[]).includes(value);
}

export interface PluginConfigFieldSchema {
  type: PluginConfigFieldType;
  required: boolean;
}

/** What a manifest's `registers` block declares it contributes to a project once installed (plan `12 §5`). Every list defaults to empty rather than being optional, so callers never need an `?? []`. */
export interface PluginManifestRegisters {
  entities: readonly string[];
  events: readonly string[];
  metrics: readonly string[];
}

/** A source/action plugin's own entry points, informational only at this story's scope — KAN-47 is what actually executes them in a sandboxed runtime. */
export interface PluginManifestEndpoints {
  sync?: string;
  action?: string;
}

/** The parsed, validated shape of one `plugin.yaml` (plan `12 §5`). */
export interface PluginManifest {
  /** Reverse-DNS-style namespaced identity, e.g. `com.example.shopify-pack`. */
  id: string;
  /** Semver `major.minor.patch`. */
  version: string;
  type: PluginType;
  displayName: string;
  /** Least-privilege, user-approved at install (plan `12 §5`) — every entry must be explicitly consented to by the installing admin. */
  scopes: readonly PluginScope[];
  configSchema: Readonly<Record<string, PluginConfigFieldSchema>>;
  registers: PluginManifestRegisters;
  endpoints: PluginManifestEndpoints;
}

export class PluginManifestValidationError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid plugin manifest: ${reasons.join('; ')}`);
    this.name = 'PluginManifestValidationError';
  }
}
