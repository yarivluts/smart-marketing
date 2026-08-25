import { SinkPluginExecutionError, type SinkPluginExecutor, type SinkPluginPushParams, type SinkPluginPushResult } from '../executor';
import { GoogleAdsApiError, type GoogleAdsApiClient, type GoogleAdsCustomerMatchUserIdentifierSet } from '../google-ads';
import { hashEmailForGoogleCustomerMatch, hashPhoneNumberForGoogleCustomerMatch } from './hashing';

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

function stringProperty(record: Record<string, unknown>, key: string): string | undefined {
  const properties = record.properties;
  if (typeof properties !== 'object' || properties === null) {
    return undefined;
  }
  const value = (properties as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** A record's `properties` blob has no usable `email` string field — expected for many rows (not every entity carries an email), so `push()` silently skips the email identifier rather than treating it as an error, the same "not every row is eligible" posture `MetaCustomAudienceSinkPluginExecutor`'s own `extractEmail` establishes. */
function extractEmail(record: Record<string, unknown>): string | undefined {
  return stringProperty(record, 'email');
}

/**
 * A record's `properties.phone` string field, Google Ads' one additional
 * Customer Match identifier this executor supports today (KAN-72 follow-up
 * — mailing address and mobile device id remain deferred, see this
 * module's own class doc comment). Optional the same way {@link extractEmail}
 * is: a row can carry a phone with no email, an email with no phone, or
 * both — {@link buildUserIdentifierSet} combines whichever are present into
 * one Customer Match member operation per row.
 */
function extractPhoneNumber(record: Record<string, unknown>): string | undefined {
  return stringProperty(record, 'phone');
}

/**
 * Builds one Customer Match member operation's worth of hashed identifiers
 * for a single record, or `undefined` if the record has neither a usable
 * email nor phone number — {@link GoogleCustomerMatchSinkPluginExecutor.push}
 * drops such rows entirely, the same way it always has for email-only rows.
 */
function buildUserIdentifierSet(record: Record<string, unknown>): GoogleAdsCustomerMatchUserIdentifierSet | undefined {
  const email = extractEmail(record);
  const phoneNumber = extractPhoneNumber(record);
  if (email === undefined && phoneNumber === undefined) {
    return undefined;
  }
  return {
    ...(email !== undefined ? { hashedEmail: hashEmailForGoogleCustomerMatch(email) } : {}),
    ...(phoneNumber !== undefined ? { hashedPhoneNumber: hashPhoneNumberForGoogleCustomerMatch(phoneNumber) } : {}),
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
 * A record contributes a Customer Match member operation only if it has a
 * usable `email` and/or `phone` string field (see {@link buildUserIdentifierSet});
 * a record with neither is silently dropped — `pushed` counts only the
 * member operations actually submitted to Google's offline user data job,
 * which may therefore be smaller than the segment's own member count
 * reported elsewhere on the page. Unlike Meta's synchronous "num received"
 * response, Google Ads processes an offline user data job asynchronously
 * (member matching can take up to several hours per Google's own docs) —
 * `pushed` is therefore "accepted for processing", not "confirmed matched";
 * there is no synchronous signal this executor could report instead.
 *
 * Mailing address and mobile device id identifiers remain deferred — see
 * `google-customer-match/manifest.ts`'s own doc comment for why (both need
 * structured source data — first/last name + postal code, or a device id —
 * that no ingested schema carries today, unlike email/phone which are
 * already-common single string fields).
 *
 * `crm-sync.service.ts`'s `syncSegmentToCrm` wraps a whole `push()` call in
 * `runWithRetryBackoff`, retrying the *same* executor instance on a
 * transient failure. If `createCustomerMatchUserList` itself already
 * succeeded on an earlier attempt and only the later
 * `addCustomerMatchUserIdentifiers` call failed, a naive re-read of the
 * constructor's `existingUserListResourceName` on retry would create a
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
    const identifierSets = params.records
      .map(buildUserIdentifierSet)
      .filter((set): set is GoogleAdsCustomerMatchUserIdentifierSet => set !== undefined);

    try {
      if (this.userListResourceName === null) {
        this.userListResourceName = (await this.apiClient.createCustomerMatchUserList(this.customerId, { name: this.userListName })).userListResourceName;
      }
      const userListResourceName = this.userListResourceName;

      if (identifierSets.length === 0) {
        return { pushed: 0, externalRef: userListResourceName };
      }

      const result = await this.apiClient.addCustomerMatchUserIdentifiers(this.customerId, userListResourceName, identifierSets);
      return { pushed: result.numReceived, externalRef: userListResourceName };
    } catch (error) {
      if (error instanceof GoogleAdsApiError) {
        throw new SinkPluginExecutionError(error.message);
      }
      throw error;
    }
  }
}
