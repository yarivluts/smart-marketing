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

  /** Platform type: 'web' | 'mobile' | 'hybrid' */
  @Field()
  public platform_type?: string;

  /** Business / Monetization model: 'saas_subscription' | 'ecommerce_physical' | 'digital_products' | 'leadgen_b2b' | 'marketplace_hybrid' */
  @Field()
  public business_model?: string;

  /** Transaction structure: 'monthly_recurring' | 'annual_recurring' | 'one_time' | 'hybrid_mixed' */
  @Field()
  public transaction_type?: string;

  /** Primary tech stack: 'shopify' | 'stripe' | 'woocommerce' | 'custom_web' | 'mobile_native' | 'hubspot_salesforce' */
  @Field()
  public primary_stack?: string;

  /** List of verified setup checklist requirement IDs */
  @Field()
  public verified_requirements?: string[];

  /** Optional user-customized list of hidden navigation module IDs */
  @Field()
  public custom_hidden_modules?: string[];

  /** Timestamp when project was archived, or undefined if active */
  @Field()
  public archived_at?: string;
}
