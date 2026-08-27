import { SinkPluginExecutionError, type SinkPluginExecutor, type SinkPluginPushParams, type SinkPluginPushResult } from '../executor';
import { MetaAdsApiError, type MetaAdsApiClient, type MetaContactMatchKey } from '../meta-ads';
import {
  hashCityForMetaCustomAudience,
  hashCountryForMetaCustomAudience,
  hashEmailForMetaCustomAudience,
  hashMobileDeviceIdForMetaCustomAudience,
  hashNameForMetaCustomAudience,
  hashPhoneForMetaCustomAudience,
  hashStateForMetaCustomAudience,
  hashZipForMetaCustomAudience,
} from './hashing';

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

/**
 * A record's `properties.device_id` field, if present (mobile-device-id
 * follow-up — the last of the three non-email identifiers `extractPhone`'s
 * own doc comment named as still deferred). Same "silently skip, not every
 * row carries one" posture as {@link extractEmail}/{@link extractPhone} —
 * `device_id` is the same property key convention `packages/dbt-transform`'s
 * own `bridge_identity` model already establishes for a device-id identity
 * key on an event schema, reused here for an entity/segment-member record.
 */
function extractDeviceId(record: Record<string, unknown>): string | undefined {
  return extractProperty(record, 'device_id');
}

/**
 * A record's `properties.first_name`/`last_name`/`city`/`state`/`zip`/
 * `country` fields, if present (mailing-address follow-up — the last of the
 * non-email identifiers this connector's own doc comment had named as still
 * deferred). Same "silently skip, not every row carries one" posture as
 * {@link extractEmail}/{@link extractPhone}/{@link extractDeviceId} — each
 * of the six is read and hashed independently, so a record with only some
 * of them (e.g. city + state but no zip) still contributes whichever it has,
 * matching Meta's own per-field `CT`/`ST`/`ZIP`/`COUNTRY` schema columns.
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

/** Builds this record's Meta contact-match key from whichever of email/phone/device id/address fields it has — `undefined` when none is present, so the caller can drop the record entirely rather than pushing an empty row. */
function extractContactMatchKey(record: Record<string, unknown>): MetaContactMatchKey | undefined {
  const email = extractEmail(record);
  const phone = extractPhone(record);
  const deviceId = extractDeviceId(record);
  const { firstName, lastName, city, state, zip, country } = extractAddressFields(record);
  if (
    email === undefined &&
    phone === undefined &&
    deviceId === undefined &&
    firstName === undefined &&
    lastName === undefined &&
    city === undefined &&
    state === undefined &&
    zip === undefined &&
    country === undefined
  ) {
    return undefined;
  }
  return {
    ...(email !== undefined ? { emailHash: hashEmailForMetaCustomAudience(email) } : {}),
    ...(phone !== undefined ? { phoneHash: hashPhoneForMetaCustomAudience(phone) } : {}),
    ...(deviceId !== undefined ? { madidHash: hashMobileDeviceIdForMetaCustomAudience(deviceId) } : {}),
    ...(firstName !== undefined ? { firstNameHash: hashNameForMetaCustomAudience(firstName) } : {}),
    ...(lastName !== undefined ? { lastNameHash: hashNameForMetaCustomAudience(lastName) } : {}),
    ...(city !== undefined ? { cityHash: hashCityForMetaCustomAudience(city) } : {}),
    ...(state !== undefined ? { stateHash: hashStateForMetaCustomAudience(state) } : {}),
    ...(zip !== undefined ? { zipHash: hashZipForMetaCustomAudience(zip) } : {}),
    ...(country !== undefined ? { countryHash: hashCountryForMetaCustomAudience(country) } : {}),
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
 * A record contributes an `EMAIL` key, a `PHONE` key, a `MADID` key, any of
 * the six mailing-address keys (`FN`/`LN`/`CT`/`ST`/`ZIP`/`COUNTRY`), any
 * combination, or (if none of `properties.email`/`properties.phone`/
 * `properties.device_id`/`properties.first_name`/`properties.last_name`/
 * `properties.city`/`properties.state`/`properties.zip`/`properties.country`
 * is a usable string) is silently dropped entirely (see
 * {@link extractContactMatchKey}) — KAN-73's own "non-email identifiers ...
 * explicitly deferred" follow-up note, now fully closed (email, phone,
 * mobile device id, and mailing address). `pushed` counts only the contact
 * rows Meta actually received, which may therefore be smaller than the
 * segment's own member count reported elsewhere on the page.
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
