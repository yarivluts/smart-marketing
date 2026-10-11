import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/** A workspace inside an organization. Data is hard-isolated per project. */
@Model({
  reference_path: 'organizations/:organization_id/projects',
  path_id: 'project_id',
})
export class ProjectModel extends BaseModel {
  @Field({ is_required: true, is_text_indexing: true })
  public name!: string;

  @Field({ is_required: true })
  public organization_id!: string;

  @Field()
  public vertical?: string;

  /**
   * Optional deep-link template into whatever session-replay/heatmap tool
   * this project uses (Microsoft Clarity, Hotjar, FullStory, ...), so a
   * landing-page row on a board can link straight to the recordings for
   * that page. `{landing_page}` in the template is replaced with the
   * URL-encoded page value; a template without that placeholder still
   * works as a plain "open the replay tool" link.
   *
   * A template rather than a tool-specific project id on purpose: every
   * vendor's filter-by-URL query string differs (and changes), so this
   * stores what the admin actually pastes out of their own tool instead of
   * this codebase guessing and shipping a link that silently 404s. Unset
   * means no link is rendered at all.
   */
  @Field()
  public session_replay_url_template?: string;

  /**
   * ISO-4217 code (e.g. `ILS`, `USD`) every spend/revenue figure this
   * project reports is denominated in (EasySign audit J-03: nothing declared
   * a currency, so an ILS-priced product's numbers rendered as `$`). Unset
   * means "not declared" — surfaces still fall back to their USD-implicit
   * labels, the pre-existing behaviour, rather than guessing.
   */
  @Field()
  public currency?: string;

  /**
   * IANA time zone (e.g. `Asia/Jerusalem`) the project's business days run
   * in — declared here so day-grain buckets can eventually follow it; today
   * every grain in `@growthos/shared`'s compiler is UTC-implicit, and this
   * field is what a caller reads to know the offset that applies.
   */
  @Field()
  public timezone?: string;

  /**
   * Set by `archiveProject` (EasySign audit J-06): an archived project drops
   * out of `listOrgProjects` (and so out of the switcher, every list, and
   * every MCP project listing) without deleting a single document under
   * it — the same "retired, never erased" posture `MetricDefModel`'s
   * `archived` status takes. `listOrgProjects({ includeArchived: true })`
   * is the only way to see it again, and `unarchiveProject` clears it.
   */
  @Field()
  public archived_at?: string;
}
