/** This connector's own plugin id — matches the `id:` in {@link CRM_WEBHOOK_PLUGIN_MANIFEST_YAML} below. */
export const CRM_WEBHOOK_PLUGIN_ID = 'com.growthos.crm-webhook';

/** The config field an org admin fills in at install time — the id of an *approved* `credential`-kind resource attachment (KAN-27) whose `SharedCredentialModel.provider` is `'generic'` and whose secret (KAN-29) is the JSON blob {@link CrmWebhookCredentialSecret} (`credential-secret.ts`) describes. */
export const CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD = 'crm_webhook_credential_attachment_id';

/**
 * The built-in CRM-sync plugin's own `plugin.yaml` (KAN-81, plan `14 §Gap 5`:
 * "export/sync to CRM (action plugin)"). Registered through the exact same
 * org-scoped Plugin Registry flow (KAN-46) any third-party manifest uses.
 * `type: action` (not `source`) — this connector never lands data *in*, it
 * pushes a saved segment's own matching records *out* to whatever URL the
 * configured credential names, via `SinkPluginExecutor` (KAN-47's runtime,
 * extended for the outbound direction). No CRM-specific OAuth integration
 * exists (or is planned without a human picking one real CRM to build
 * against) — a generic authenticated webhook is this repo's own established
 * "buildable-today stand-in for a real provider" posture (see
 * `STRIPE_PLUGIN_MANIFEST_YAML`'s own doc comment for the inbound
 * equivalent), and it composes with the `generic` `SharedCredentialModel`
 * provider that already exists for exactly this kind of "no dedicated
 * provider yet" credential.
 */
export const CRM_WEBHOOK_PLUGIN_MANIFEST_YAML = `
id: ${CRM_WEBHOOK_PLUGIN_ID}
version: 1.0.0
type: action
display_name: CRM Sync (Webhook)
scopes: [action:execute]
config_schema:
  ${CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}: { type: string, required: true }
endpoints:
  action: ./push.ts
`.trim();
