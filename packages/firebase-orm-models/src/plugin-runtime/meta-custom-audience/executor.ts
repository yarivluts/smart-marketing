import { SinkPluginExecutionError, type SinkPluginExecutor, type SinkPluginPushParams, type SinkPluginPushResult } from '../executor';
import { MetaAdsApiError, type MetaAdsApiClient, type MetaContactMatchKey } from '../meta-ads';
import { hashEmailForMetaCustomAudience, hashPhoneForMetaCustomAudience } from './hashing';

export interface MetaCustomAudienceSinkPluginExecutorOptions {
  apiClient: MetaAdsApiClient;
  adAccountId: string;
  /** The Custom Audience's display name — only used the first time this install syncs (see `existingAudienceId`'s own doc comment). */
  audienceName: string;
  /**
   * The Custom Audience id a previous sync already created for this install
   * (`PluginInstallModel.sink_external_ref`), or `null` on this
   * install's first-ever sync. When set, `push()` adds to the same audience
   * instead of creating a duplicate one on every sync — resolved by the
   * caller (`crm-sync.service.ts`'s dispatch, mirroring
   * `MetaAutomationActionExecutor.resolveCampaignBudgetResourceName`'s own
   * "create once, cache and reuse the resource id" pattern) fresh on every
   * call, so a value the caller persisted after a prior `push()`'s own
   * {@link SinkPluginPushResult.externalRef} is what a later sync sees here.
   * Cached in-instance (not just read once) once `push()` itself creates
   * one — see that field's own doc comment for why.
   */
  existingAudienceId: string | null;
}

function extractProperty(record: Record<string, unknown>, key: string): string | undefined {
  const properties = record.properties;
  if (typeof properties !== 'object' || properties === null) {
    return undefined;
  }
  const value = (properties as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** A record's `properties` blob has no usable `email` string field — expected for many rows (not every entity carries an email), so `push()` silently skips it rather than treating it as an error, the same "not every row is eligible" posture a segment sync already accepts implicitly by only ever pushing what it can. */
function extractEmail(record: Record<string, unknown>): string | undefined {
  return extractProperty(record, 'email');
}

/**
 * A record's `properties.phone` field, if present (KAN-73 follow-up — the
 * non-email identifier plan `13 §E21.3`'s own doc comment had explicitly
 * deferred). Same "silently skip, not every row carries one" posture as
 * {@link extractEmail} — no country-code/format validation happens here,
 * see `hashPhoneForMetaCustomAudience`'s own doc comment for why.
 */
function extractPhone(record: Record<string, unknown>): string | undefined {
  return extractProperty(record, 'phone');
}

/** Builds this record's Meta contact-match key from whichever of email/phone it has — `undefined` when neither is present, so the caller can drop the record entirely rather than pushing an empty row. */
function extractContactMatchKey(record: Record<string, unknown>): MetaContactMatchKey | undefined {
  const email = extractEmail(record);
  const phone = extractPhone(record);
  if (email === undefined && phone === undefined) {
    return undefined;
  }
  return {
    ...(email !== undefined ? { emailHash: hashEmailForMetaCustomAudience(email) } : {}),
    ...(phone !== undefined ? { phoneHash: hashPhoneForMetaCustomAudience(phone) } : {}),
  };
}

/**
 * The real Meta Custom Audience `SinkPluginExecutor` (KAN-73 follow-up —
 * see `plugin-runtime/meta-custom-audience/manifest.ts`'s own doc comment
 * for why this exists as its own connector rather than folded into
 * `MetaAutomationActionExecutor`: a Custom Audience is a data-sync action
 * driven by a saved segment's own live membership, not a campaign-lifecycle
 * mutation, so it fits the `SinkPluginExecutor` shape `CrmWebhookSinkPluginExecutor`
 * already established for "push a segment's rows to some external system"
 * far better than the automation action pipeline's dry-run/approve/execute
 * lifecycle (there is no budget/guardrail-relevant "before/after" here to
 * diff or roll back).
 *
 * A record contributes an `EMAIL` key, a `PHONE` key, both, or (if neither
 * `properties.email` nor `properties.phone` is a usable string) is silently
 * dropped entirely (see {@link extractContactMatchKey}) — KAN-73's own
 * "non-email identifiers ... explicitly deferred" follow-up note, closed by
 * adding `phone` here rather than a separate identifier type (mailing
 * address and device id remain deferred — Meta's own upload schema needs a
 * different, multi-field shape for each that this story's phone-only scope
 * doesn't build). `pushed` counts only the contact rows Meta actually
 * received, which may therefore be smaller than the segment's own member
 * count reported elsewhere on the page.
 *
 * `crm-sync.service.ts`'s `syncSegmentToCrm` wraps a whole `push()` call in
 * `runWithRetryBackoff`, retrying the *same* executor instance on a
 * transient failure. If `createCustomAudience` itself already succeeded on
 * an earlier attempt and only the later `addContactsToCustomAudience`
 * call failed, a naive re-read of the constructor's `existingAudienceId` on
 * retry would create a second, orphaned audience — so the id created mid-way
 * through one `push()` is cached on `this.audienceId` (mutable, unlike the
 * rest of this class's fields) rather than only ever read from the
 * constructor option, and every retry of the same instance reuses it.
 */
export class MetaCustomAudienceSinkPluginExecutor implements SinkPluginExecutor {
  private readonly apiClient: MetaAdsApiClient;
  private readonly adAccountId: string;
  private readonly audienceName: string;
  private audienceId: string | null;

  constructor(options: MetaCustomAudienceSinkPluginExecutorOptions) {
    this.apiClient = options.apiClient;
    this.adAccountId = options.adAccountId;
    this.audienceName = options.audienceName;
    this.audienceId = options.existingAudienceId;
  }

  async push(params: SinkPluginPushParams): Promise<SinkPluginPushResult> {
    const contacts = params.records.map(extractContactMatchKey).filter((contact): contact is MetaContactMatchKey => contact !== undefined);

    try {
      if (this.audienceId === null) {
        this.audienceId = (await this.apiClient.createCustomAudience(this.adAccountId, { name: this.audienceName })).audienceId;
      }
      const audienceId = this.audienceId;

      if (contacts.length === 0) {
        return { pushed: 0, externalRef: audienceId };
      }

      const result = await this.apiClient.addContactsToCustomAudience(audienceId, contacts);
      return { pushed: result.numReceived, externalRef: audienceId };
    } catch (error) {
      if (error instanceof MetaAdsApiError) {
        throw new SinkPluginExecutionError(error.message);
      }
      throw error;
    }
  }
}
