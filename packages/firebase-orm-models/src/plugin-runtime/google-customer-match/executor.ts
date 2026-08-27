import { SinkPluginExecutionError, type SinkPluginExecutor, type SinkPluginPushParams, type SinkPluginPushResult } from '../executor';
import { GoogleAdsApiError, type GoogleAdsApiClient, type GoogleAdsContactMatchKey } from '../google-ads';
import {
  hashEmailForGoogleCustomerMatch,
  hashNameForGoogleCustomerMatch,
  hashPhoneForGoogleCustomerMatch,
  normalizeCityForGoogleCustomerMatch,
  normalizeCountryCodeForGoogleCustomerMatch,
  normalizeMobileIdForGoogleCustomerMatch,
  normalizePostalCodeForGoogleCustomerMatch,
  normalizeStateForGoogleCustomerMatch,
} from './hashing';

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

/**
 * A record's `properties.device_id` field, if present (mobile-device-id
 * follow-up — the last of the two non-email identifiers `extractPhone`'s own
 * doc comment had named as still deferred, the direct Google Ads sibling of
 * `MetaCustomAudienceSinkPluginExecutor`'s own `extractDeviceId`). Same
 * "silently skip, not every row carries one" posture as
 * {@link extractEmail}/{@link extractPhone} — `device_id` is the same
 * property key convention `packages/dbt-transform`'s own `bridge_identity`
 * model already establishes for a device-id identity key on an event
 * schema.
 */
function extractDeviceId(record: Record<string, unknown>): string | undefined {
  return extractProperty(record, 'device_id');
}

/**
 * A record's `properties.first_name`/`last_name`/`city`/`state`/`zip`/
 * `country` fields, if present (mailing-address follow-up — the last of the
 * non-email identifiers this connector's own doc comment had named as still
 * deferred, the direct Google Ads sibling of `MetaCustomAudienceSinkPluginExecutor`'s
 * own `extractAddressFields`). Same "silently skip, not every row carries
 * one" posture as {@link extractEmail}/{@link extractPhone}/{@link extractDeviceId}.
 */
function extractAddressFields(record: Record<string, unknown>): {
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
} {
  return {
    firstName: extractProperty(record, 'first_name'),
    lastName: extractProperty(record, 'last_name'),
    city: extractProperty(record, 'city'),
    state: extractProperty(record, 'state'),
    zip: extractProperty(record, 'zip'),
    country: extractProperty(record, 'country'),
  };
}

/** Builds this record's Google Ads contact-match key from whichever of email/phone/device id/address fields it has — `undefined` when none is present, so the caller can drop the record entirely rather than pushing an identifier-less operation. */
function extractContactMatchKey(record: Record<string, unknown>): GoogleAdsContactMatchKey | undefined {
  const email = extractEmail(record);
  const phone = extractPhone(record);
  const deviceId = extractDeviceId(record);
  const { firstName, lastName, city, state, zip, country } = extractAddressFields(record);
  const hasAddressField =
    firstName !== undefined || lastName !== undefined || city !== undefined || state !== undefined || zip !== undefined || country !== undefined;
  if (email === undefined && phone === undefined && deviceId === undefined && !hasAddressField) {
    return undefined;
  }
  const addressInfo = hasAddressField
    ? {
        ...(firstName !== undefined ? { hashedFirstName: hashNameForGoogleCustomerMatch(firstName) } : {}),
        ...(lastName !== undefined ? { hashedLastName: hashNameForGoogleCustomerMatch(lastName) } : {}),
        ...(city !== undefined ? { city: normalizeCityForGoogleCustomerMatch(city) } : {}),
        ...(state !== undefined ? { state: normalizeStateForGoogleCustomerMatch(state) } : {}),
        ...(country !== undefined ? { countryCode: normalizeCountryCodeForGoogleCustomerMatch(country) } : {}),
        ...(zip !== undefined ? { postalCode: normalizePostalCodeForGoogleCustomerMatch(zip) } : {}),
      }
    : undefined;
  return {
    ...(email !== undefined ? { hashedEmail: hashEmailForGoogleCustomerMatch(email) } : {}),
    ...(phone !== undefined ? { hashedPhoneNumber: hashPhoneForGoogleCustomerMatch(phone) } : {}),
    ...(deviceId !== undefined ? { mobileId: normalizeMobileIdForGoogleCustomerMatch(deviceId) } : {}),
    ...(addressInfo !== undefined ? { addressInfo } : {}),
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
 * identifier, a `mobileId` identifier, an `addressInfo` identifier (mailing
 * address), any combination, or (if none of `properties.email`/
 * `properties.phone`/`properties.device_id`/`properties.first_name`/
 * `properties.last_name`/`properties.city`/`properties.state`/
 * `properties.zip`/`properties.country` is a usable string) is silently
 * dropped entirely (see {@link extractContactMatchKey}) — KAN-72's own
 * "non-email identifiers ... explicitly deferred" follow-up note, now fully
 * closed (email, phone, mobile device id, and mailing address). Unlike
 * `hashedEmail`/`hashedPhoneNumber`, `mobileId` is never hashed (see
 * `hashing.ts`'s own `normalizeMobileIdForGoogleCustomerMatch` doc comment
 * for why Google's own spec requires this one raw); `addressInfo` only
 * hashes its first/last name fields (see `hashNameForGoogleCustomerMatch`'s
 * own doc comment). `pushed` counts only the contact rows actually
 * submitted to
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
