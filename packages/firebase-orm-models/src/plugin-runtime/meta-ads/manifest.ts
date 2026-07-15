/** This connector's own plugin id — matches the `id:` in {@link META_MANAGE_PLUGIN_MANIFEST_YAML} below. */
export const META_MANAGE_PLUGIN_ID = 'com.growthos.meta-manage';

/** The config field an org admin fills in at install time — the id of an *approved* `credential`-kind resource attachment (KAN-27) whose `SharedCredentialModel.provider` is `'meta_ads'` and whose secret (KAN-29) is the JSON blob {@link MetaAdsCredentialSecret} (`credential-secret.ts`) describes. */
export const META_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD = 'meta_credential_attachment_id';

/**
 * The built-in Meta Manage plugin's own `plugin.yaml` (KAN-73, plan
 * `13 §E21.3`) — mirrors `GOOGLE_ADS_MANAGE_PLUGIN_MANIFEST_YAML`'s shape
 * exactly. Registered through the same org-scoped Plugin Registry flow
 * (KAN-46) any third-party manifest uses. `type: action` + `scopes:
 * [action:execute]` since this plugin doesn't land ingest records — it
 * mutates a real ad account through the KAN-71 automation pipeline
 * (`MetaAutomationActionExecutor`, resolved per-target by
 * `resolveAutomationActionExecutorForTarget` once installed+enabled and a
 * target is linked to a `provider: 'meta_ads'` credential at the `manage`
 * write tier). Installing this plugin is the org-level "I consent to
 * `action:execute`" formality (KAN-46's own "install-per-project flow, scope
 * consent" AC); the actual per-connection write-tier gate is KAN-74's
 * `ResourceAttachmentModel.write_tier`, re-checked on every propose/approve/
 * execute regardless of install state.
 */
export const META_MANAGE_PLUGIN_MANIFEST_YAML = `
id: ${META_MANAGE_PLUGIN_ID}
version: 1.0.0
type: action
display_name: Meta Ads (Manage)
scopes: [action:execute]
config_schema:
  ${META_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}: { type: string, required: true }
endpoints:
  action: ./executor.ts
`.trim();
