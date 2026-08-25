import { SinkPluginExecutionError, type SinkPluginExecutor, type SinkPluginPushParams, type SinkPluginPushResult } from '../executor';
import { MetaAdsApiError, type MetaAdsApiClient } from '../meta-ads';
import { hashEmailForMetaCustomAudience } from './hashing';

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

/** A record's `properties` blob has no usable `email` string field — expected for many rows (not every entity carries an email), so `push()` silently skips it rather than treating it as an error, the same "not every row is eligible" posture a segment sync already accepts implicitly by only ever pushing what it can. */
function extractEmail(record: Record<string, unknown>): string | undefined {
  const properties = record.properties;
  if (typeof properties !== 'object' || properties === null) {
    return undefined;
  }
  const email = (properties as Record<string, unknown>).email;
  return typeof email === 'string' && email.trim().length > 0 ? email : undefined;
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
 * Every record without a usable `email` string field is silently dropped
 * (see {@link extractEmail}) — `pushed` counts only the emails Meta actually
 * received, which may therefore be smaller than the segment's own member
 * count reported elsewhere on the page.
 *
 * `crm-sync.service.ts`'s `syncSegmentToCrm` wraps a whole `push()` call in
 * `runWithRetryBackoff`, retrying the *same* executor instance on a
 * transient failure. If `createCustomAudience` itself already succeeded on
 * an earlier attempt and only the later `addHashedEmailsToCustomAudience`
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
    const emails = params.records.map(extractEmail).filter((email): email is string => email !== undefined);

    try {
      if (this.audienceId === null) {
        this.audienceId = (await this.apiClient.createCustomAudience(this.adAccountId, { name: this.audienceName })).audienceId;
      }
      const audienceId = this.audienceId;

      if (emails.length === 0) {
        return { pushed: 0, externalRef: audienceId };
      }

      const hashedEmails = emails.map(hashEmailForMetaCustomAudience);
      const result = await this.apiClient.addHashedEmailsToCustomAudience(audienceId, hashedEmails);
      return { pushed: result.numReceived, externalRef: audienceId };
    } catch (error) {
      if (error instanceof MetaAdsApiError) {
        throw new SinkPluginExecutionError(error.message);
      }
      throw error;
    }
  }
}
