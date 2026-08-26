/** This connector's own plugin id — matches the `id:` in {@link META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML} below. */
export const META_CUSTOM_AUDIENCE_PLUGIN_ID = 'com.growthos.meta-custom-audience';

/** The config field an org admin fills in at install time — the id of an *approved* `credential`-kind resource attachment (KAN-27) whose `SharedCredentialModel.provider` is `'meta_ads'` and whose secret (KAN-29) is the JSON blob `MetaAdsCredentialSecret` (`plugin-runtime/meta-ads/credential-secret.ts`) describes — the exact same credential shape KAN-73's Meta Manage plugin already resolves, reused here rather than a second Meta credential concept. */
export const META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD = 'meta_custom_audience_credential_attachment_id';

/** The config field naming the Custom Audience's display name on Meta — set once at install time, used to create the audience the first time a segment syncs to this install (see `PluginInstallModel.sink_external_ref`'s own doc comment for how the created audience is then reused on every later sync). */
export const META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD = 'audience_name';

/**
 * The built-in Meta Custom Audience plugin's own `plugin.yaml` (KAN-73
 * follow-up, plan `13 §E21.3`'s own "Custom/Lookalike audience creation from
 * GrowthOS segments" bullet — deferred at KAN-73 merge time because no
 * segment concept with a live, row-returning membership export existed yet;
 * KAN-81 (`listSegmentMembers`) closed that gap). Registered through the
 * same org-scoped Plugin Registry flow (KAN-46) any third-party manifest
 * uses, and synced the same generic "pick an action-type install, sync this
 * segment to it now" way `CRM_WEBHOOK_PLUGIN_MANIFEST_YAML` already
 * established (`crm-sync.service.ts`'s `syncSegmentToCrm`, despite its own
 * CRM-specific name — see that file's own doc comment). `type: action` +
 * `scopes: [action:execute]`, mirroring `CRM_WEBHOOK_PLUGIN_MANIFEST_YAML`'s
 * shape exactly. Email-, phone-, and mobile-device-id-based Custom Audiences
 * are all built here (a record's `properties.email`/`properties.phone`/
 * `properties.device_id`, hashed per-connector — see `executor.ts`'s own
 * `extractContactMatchKey`). Lookalike Audience creation from this install's
 * own Custom Audience seed is a separate, one-off action
 * (`crm-sync.service.ts`'s `createMetaLookalikeAudience`, not part of this
 * manifest/executor — a Lookalike expands a seed audience's membership once
 * at creation time, unlike this connector's own repeatable "sync a segment's
 * rows" `push()` lifecycle) — see that function's own doc comment.
 * Mailing-address remains a natural, explicitly deferred follow-up (same
 * "documented, not built" posture KAN-73's own PMax-asset-groups/
 * post-creation-edits bullets already carry) — Meta's own upload schema
 * needs a different, multi-field shape for it that this connector's
 * single-string-per-identifier scope doesn't build.
 */
export const META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML = `
id: ${META_CUSTOM_AUDIENCE_PLUGIN_ID}
version: 1.0.0
type: action
display_name: Meta Custom Audience Sync
scopes: [action:execute]
config_schema:
  ${META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}: { type: string, required: true }
  ${META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD}: { type: string, required: true }
endpoints:
  action: ./executor.ts
`.trim();
