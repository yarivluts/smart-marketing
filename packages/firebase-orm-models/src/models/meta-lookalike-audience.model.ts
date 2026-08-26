import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * One Meta Lookalike Audience created from a `META_CUSTOM_AUDIENCE_PLUGIN_ID`
 * install's own Custom Audience seed (KAN-73 follow-up, plan `13 §E21.3`'s
 * own "Custom/Lookalike audience creation from GrowthOS segments" bullet —
 * `plugin-runtime/meta-custom-audience/manifest.ts`'s own doc comment named
 * Lookalike creation as the one still-deferred half after Custom Audiences
 * themselves shipped). Firestore run-record history, the same "the record is
 * the result" posture `PluginSinkRunModel`/`PluginSourceRunModel` already
 * establish — a Lookalike Audience isn't a repeatable sync (Meta expands the
 * seed's membership once at creation time; there is nothing to "push" on a
 * later run), so this is a durable creation log + admin-facing list, not a
 * run history with retries.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/meta_lookalike_audiences',
  path_id: 'meta_lookalike_audience_id',
})
export class MetaLookalikeAudienceModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  /** The `META_CUSTOM_AUDIENCE_PLUGIN_ID` install this Lookalike was created from — its `sink_external_ref` at creation time is {@link origin_audience_id}. */
  @Field({ is_required: true })
  public plugin_install_id!: string;

  /** Meta's own Lookalike Audience id, as returned by `createLookalikeAudience`. */
  @Field({ is_required: true })
  public audience_id!: string;

  @Field({ is_required: true })
  public name!: string;

  /** The seed Custom Audience id this Lookalike was expanded from — `install.sink_external_ref` at creation time, kept here too so this row stays self-describing even if the install later re-syncs to a different seed audience. */
  @Field({ is_required: true })
  public origin_audience_id!: string;

  /** ISO-3166 alpha-2 country code the Lookalike was built for. */
  @Field({ is_required: true })
  public country!: string;

  /** Similarity ratio, 0.01-0.20 (1%-20% of the country's population), matching Meta's own `lookalike_spec.ratio`. */
  @Field({ is_required: true })
  public ratio!: number;

  @Field({ is_required: true })
  public created_by_user_id!: string;

  @Field({ is_required: true })
  public created_at!: string;
}
