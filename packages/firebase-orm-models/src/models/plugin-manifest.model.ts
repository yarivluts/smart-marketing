import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { PluginConfigFieldSchema, PluginManifestEndpoints, PluginManifestRegisters, PluginScope, PluginType } from '@growthos/shared';

/**
 * One registered version of a plugin (KAN-46, plan `08 §4`/`12 §5`): an
 * org-level catalog entry — "official, partner, and private (per-org)
 * plugins" (plan `08 §4`'s Registry/marketplace bullet) — parsed and
 * validated from a `plugin.yaml` document by `@growthos/shared`'s
 * `parsePluginManifest`. Unlike `SchemaDefModel`/`MetricDefModel`'s
 * "one active version, others superseded" convention, a plugin registry
 * behaves like a package registry: every published `(plugin_id, version)`
 * pair is immutable and independently installable — an older version stays
 * fully valid so a project that installed it isn't silently forced onto a
 * newer one — so there is no `status` field here; `plugin-registry.service.ts`
 * computes "latest" by comparing `version` in code instead.
 */
@Model({
  reference_path: 'organizations/:organization_id/plugin_manifests',
  path_id: 'plugin_manifest_id',
})
export class PluginManifestModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  /** The manifest's own reverse-DNS-style identity, e.g. `com.example.shopify-pack` — stable across versions. */
  @Field({ is_required: true, is_text_indexing: true })
  public plugin_id!: string;

  /** Semver `major.minor.patch`. */
  @Field({ is_required: true })
  public version!: string;

  @Field({ is_required: true })
  public type!: PluginType;

  @Field({ is_required: true })
  public display_name!: string;

  /** Least-privilege scopes this version declares — an install must consent to exactly this list (plan `12 §5`'s "user-approved at install"). */
  @Field({ is_required: true })
  public scopes!: PluginScope[];

  @Field({ is_required: true })
  public config_schema!: Record<string, PluginConfigFieldSchema>;

  @Field({ is_required: true })
  public registers!: PluginManifestRegisters;

  @Field({ is_required: true })
  public endpoints!: PluginManifestEndpoints;

  /** The original YAML text, kept verbatim for audit/debugging — the parsed fields above are what every other query actually reads. */
  @Field({ is_required: true })
  public raw_manifest!: string;

  @Field({ is_required: true })
  public registered_by!: string;

  @Field({ is_required: true })
  public registered_at!: string;
}
