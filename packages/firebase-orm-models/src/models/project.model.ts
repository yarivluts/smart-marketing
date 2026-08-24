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
   * When true, this project is the GrowthOS demo / showcase project.
   * All marketing intelligence pages show rich pre-seeded mock data so
   * users can explore the product without connecting a real ad account.
   * Real (non-demo) projects show only authentic data pulled from live
   * integrations or show empty-state prompts until data is connected.
   */
  @Field()
  public is_demo?: boolean;
}
