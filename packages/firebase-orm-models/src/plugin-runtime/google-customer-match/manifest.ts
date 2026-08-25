/** This connector's own plugin id — matches the `id:` in {@link GOOGLE_CUSTOMER_MATCH_PLUGIN_MANIFEST_YAML} below. */
export const GOOGLE_CUSTOMER_MATCH_PLUGIN_ID = 'com.growthos.google-customer-match';

/** The config field an org admin fills in at install time — the id of an *approved* `credential`-kind resource attachment (KAN-27) whose `SharedCredentialModel.provider` is `'google_ads'` and whose secret (KAN-29) is the JSON blob `GoogleAdsCredentialSecret` (`plugin-runtime/google-ads/credential-secret.ts`) describes — the exact same credential shape KAN-72's Google Ads Manage plugin already resolves, reused here rather than a second Google Ads credential concept. */
export const GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD = 'google_customer_match_credential_attachment_id';

/** The config field naming the Customer Match user list's display name on Google Ads — set once at install time, used to create the list the first time a segment syncs to this install (see `PluginInstallModel.sink_external_ref`'s own doc comment for how the created list is then reused on every later sync). */
export const GOOGLE_CUSTOMER_MATCH_NAME_CONFIG_FIELD = 'user_list_name';

/**
 * The built-in Google Ads Customer Match plugin's own `plugin.yaml`
 * (KAN-72 follow-up, plan `13 §E21.2`'s own "audience attach" bullet —
 * deferred at KAN-72 merge time for the same reason KAN-73's own Custom
 * Audience follow-up was: no segment concept with a live, row-returning
 * membership export existed yet; KAN-81 (`listSegmentMembers`) closed that
 * gap, and KAN-73's own PR #286 already built the direct Meta-side sibling
 * of this exact feature). Registered through the same org-scoped Plugin
 * Registry flow (KAN-46) any third-party manifest uses, and synced the
 * same generic "pick an action-type install, sync this segment to it now"
 * way `CRM_WEBHOOK_PLUGIN_MANIFEST_YAML`/`META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML`
 * already established (`crm-sync.service.ts`'s `syncSegmentToCrm`).
 * `type: action` + `scopes: [action:execute]`, mirroring
 * `META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML`'s shape exactly. A
 * contact-info Customer Match list is built here from both email and phone
 * (a record's `properties.email`/`properties.phone`, hashed per-connector —
 * see `executor.ts`'s own `extractContactMatchKey`) — Similar Audience
 * expansion from a Customer Match seed, and the remaining non-email/phone
 * identifiers (mailing address, mobile device id), are explicitly deferred,
 * same "documented, not built" posture KAN-72's own PMax-asset-groups/
 * post-creation-edits bullets already carry.
 */
export const GOOGLE_CUSTOMER_MATCH_PLUGIN_MANIFEST_YAML = `
id: ${GOOGLE_CUSTOMER_MATCH_PLUGIN_ID}
version: 1.0.0
type: action
display_name: Google Ads Customer Match Sync
scopes: [action:execute]
config_schema:
  ${GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}: { type: string, required: true }
  ${GOOGLE_CUSTOMER_MATCH_NAME_CONFIG_FIELD}: { type: string, required: true }
endpoints:
  action: ./executor.ts
`.trim();
