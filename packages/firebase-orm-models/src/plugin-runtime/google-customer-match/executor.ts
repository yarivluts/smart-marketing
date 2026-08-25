import { SinkPluginExecutionError, type SinkPluginExecutor, type SinkPluginPushParams, type SinkPluginPushResult } from '../executor';
import { GoogleAdsApiError, type GoogleAdsApiClient, type GoogleAdsContactMatchKey } from '../google-ads';
import { hashEmailForGoogleCustomerMatch, hashPhoneForGoogleCustomerMatch } from './hashing';

export interface GoogleCustomerMatchSinkPluginExecutorOptions {
  apiClient: GoogleAdsApiClient;
  customerId: string;
  /** The Customer Match user list's display name — only used the first time this install syncs (see `existingUserListResourceName`'s own doc comment). */
  userListName: string;
  /**
   * The Customer Match user list resource name a previous sync already
   * created for this install (`PluginInstallModel.sink_external_ref`), or
   * `null` on this install's first-ever sync. When set, `push()` adds to
   * the same list instead of creating a duplicate one on every sync —
   * resolved by the caller (`crm-sync.service.ts`'s dispatch) fresh on
   * every call, so a value the caller persisted after a prior `push()`'s
   * own {@link SinkPluginPushResult.externalRef} is what a later sync sees
   * here. Cached in-instance (not just read once) once `push()` itself
   * creates one — see that field's own doc comment for why, the exact same
   * reasoning `MetaCustomAudienceSinkPluginExecutor` documents for its own
   * `audienceId`.
   */
  existingUserListResourceName: string | null;
}

function extractProperty(record: Record<string, unknown>, key: string): string | undefined {
  const properties = record.properties;
  if (typeof properties !== 'object' || properties === null) {
    return undefined;
  }
  const value = (properties as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** A record's `properties` blob has no usable `email` string field — expected for many rows (not every entity carries an email), so `push()` silently skips it rather than treating it as an error, the same "not every row is eligible" posture `MetaCustomAudienceSinkPluginExecutor`'s own `extractEmail` establishes. */
function extractEmail(record: Record<string, unknown>): string | undefined {
  return extractProperty(record, 'email');
}

/**
 * A record's `properties.phone` field, if present (KAN-72 follow-up — the
 * non-email identifier plan `13 §E21.2`'s own doc comment had explicitly
 * deferred, the direct Google Ads sibling of `MetaCustomAudienceSinkPluginExecutor`'s
 * own `extractPhone`). Same "silently skip, not every row carries one"
 * posture as {@link extractEmail} — no country-code/format validation
 * happens here, see `hashPhoneForGoogleCustomerMatch`'s own doc comment for
 * why.
 */
function extractPhone(record: Record<string, unknown>): string | undefined {
  return extractProperty(record, 'phone');
}

/** Builds this record's Google Ads contact-match key from whichever of email/phone it has — `undefined` when neither is present, so the caller can drop the record entirely rather than pushing an identifier-less operation. */
function extractContactMatchKey(record: Record<string, unknown>): GoogleAdsContactMatchKey | undefined {
  const email = extractEmail(record);
  const phone = extractPhone(record);
  if (email === undefined && phone === undefined) {
    return undefined;
  }
  return {
    ...(email !== undefined ? { hashedEmail: hashEmailForGoogleCustomerMatch(email) } : {}),
    ...(phone !== undefined ? { hashedPhoneNumber: hashPhoneForGoogleCustomerMatch(phone) } : {}),
  };
}

/**
 * The real Google Ads Customer Match `SinkPluginExecutor` (KAN-72 follow-up
 * — the direct Google Ads sibling of `MetaCustomAudienceSinkPluginExecutor`,
 * see that module's own doc comment for why a segment-driven audience sync
 * fits the `SinkPluginExecutor` shape rather than the automation action
 * pipeline's dry-run/approve/execute lifecycle: there is no budget/guardrail
 * "before/after" here to diff or roll back, just "push these matching rows
 * out").
 *
 * A record contributes a `hashedEmail` identifier, a `hashedPhoneNumber`
 * identifier, both, or (if neither `properties.email` nor `properties.phone`
 * is a usable string) is silently dropped entirely (see
 * {@link extractContactMatchKey}) — KAN-72's own "non-email identifiers ...
 * explicitly deferred" follow-up note, closed by adding `phone` here rather
 * than a separate identifier type (mailing address and mobile device id
 * remain deferred — Google's own offline-data-job schema needs a different,
 * multi-field shape for each that this story's phone-only scope doesn't
 * build). `pushed` counts only the contact rows actually submitted to
 * Google's offline user data job, which may therefore be smaller than the
 * segment's own member count reported elsewhere on the page. Unlike Meta's
 * synchronous "num received" response, Google Ads processes an offline user
 * data job asynchronously (member matching can take up to several hours per
 * Google's own docs) — `pushed` is therefore "accepted for processing", not
 * "confirmed matched"; there is no synchronous signal this executor could
 * report instead.
 *
 * `crm-sync.service.ts`'s `syncSegmentToCrm` wraps a whole `push()` call in
 * `runWithRetryBackoff`, retrying the *same* executor instance on a
 * transient failure. If `createCustomerMatchUserList` itself already
 * succeeded on an earlier attempt and only the later
 * `addContactsToCustomerMatchUserList` call failed, a naive re-read of
 * the constructor's `existingUserListResourceName` on retry would create a
 * second, orphaned list — so the resource name created mid-way through one
 * `push()` is cached on `this.userListResourceName` (mutable, unlike the
 * rest of this class's fields) rather than only ever read from the
 * constructor option, and every retry of the same instance reuses it — the
 * exact same fix `MetaCustomAudienceSinkPluginExecutor` already applies for
 * its own `audienceId`.
 */
export class GoogleCustomerMatchSinkPluginExecutor implements SinkPluginExecutor {
  private readonly apiClient: GoogleAdsApiClient;
  private readonly customerId: string;
  private readonly userListName: string;
  private userListResourceName: string | null;

  constructor(options: GoogleCustomerMatchSinkPluginExecutorOptions) {
    this.apiClient = options.apiClient;
    this.customerId = options.customerId;
    this.userListName = options.userListName;
    this.userListResourceName = options.existingUserListResourceName;
  }

  async push(params: SinkPluginPushParams): Promise<SinkPluginPushResult> {
    const contacts = params.records.map(extractContactMatchKey).filter((contact): contact is GoogleAdsContactMatchKey => contact !== undefined);

    try {
      if (this.userListResourceName === null) {
        this.userListResourceName = (await this.apiClient.createCustomerMatchUserList(this.customerId, { name: this.userListName })).userListResourceName;
      }
      const userListResourceName = this.userListResourceName;

      if (contacts.length === 0) {
        return { pushed: 0, externalRef: userListResourceName };
      }

      const result = await this.apiClient.addContactsToCustomerMatchUserList(this.customerId, userListResourceName, contacts);
      return { pushed: result.numReceived, externalRef: userListResourceName };
    } catch (error) {
      if (error instanceof GoogleAdsApiError) {
        throw new SinkPluginExecutionError(error.message);
      }
      throw error;
    }
  }
}
