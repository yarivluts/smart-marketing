/** This connector's own plugin id — matches the `id:` in {@link GOOGLE_ADS_MANAGE_PLUGIN_MANIFEST_YAML} below. */
export const GOOGLE_ADS_MANAGE_PLUGIN_ID = 'com.growthos.google-ads-manage';

/** The config field an org admin fills in at install time — the id of an *approved* `credential`-kind resource attachment (KAN-27) whose `SharedCredentialModel.provider` is `'google_ads'` and whose secret (KAN-29) is the JSON blob {@link GoogleAdsCredentialSecret} (`credential-secret.ts`) describes. */
export const GOOGLE_ADS_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD = 'google_ads_credential_attachment_id';

/**
 * The built-in Google Ads Manage plugin's own `plugin.yaml` (KAN-72, plan
 * `13 §E21.2`). Registered through the exact same org-scoped Plugin Registry
 * flow (KAN-46) any third-party manifest uses. `type: action` + `scopes:
 * [action:execute]` (rather than `source`/`ingest:write` like KAN-49's
 * Stripe connector) since this plugin doesn't land ingest records — it
 * mutates a real ad account through the KAN-71 automation pipeline
 * (`GoogleAdsAutomationActionExecutor`, resolved per-target by
 * `resolveAutomationActionExecutorForTarget` once installed+enabled and a
 * target is linked to a `provider: 'google_ads'` credential at the `manage`
 * write tier). Installing this plugin is the org-level "I consent to
 * `action:execute`" formality (KAN-46's own "install-per-project flow, scope
 * consent" AC); the actual per-connection write-tier gate is KAN-74's
 * `ResourceAttachmentModel.write_tier`, re-checked on every propose/approve/
 * execute regardless of install state.
 */
export const GOOGLE_ADS_MANAGE_PLUGIN_MANIFEST_YAML = `
id: ${GOOGLE_ADS_MANAGE_PLUGIN_ID}
version: 1.0.0
type: action
display_name: Google Ads (Manage)
scopes: [action:execute]
config_schema:
  ${GOOGLE_ADS_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}: { type: string, required: true }
endpoints:
  action: ./executor.ts
`.trim();
