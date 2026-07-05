import { type Permission } from './permissions';

/**
 * Permissions a machine-held API key (KAN-28) may carry as a scope. A
 * deliberate subset of the full `Permission` catalog, not the whole thing —
 * the same "least privilege for a non-human principal" reasoning
 * `INVITABLE_ROLES` (`roles.ts`) already applies to org invites. Withheld:
 * `project.manage`/`members.manage`/`billing.manage`/`resources.manage`
 * (org/project administration — a leaked long-lived key should never be able
 * to reshape who has access), `keys.manage` (a key must not be able to mint
 * or revoke other keys), `automation.approve`/`automation.execute` (plan 06
 * §3: "automation execution rights are a separate, elevated scope" — money-
 * moving actions need a human role, not a bearer token), `pii.read`
 * (plan 08 §5.4's separate PII gate), and `plugin.install` (an install is an
 * admin action). What's left is the machine-appropriate surface: pushing
 * data in, writing schemas/metrics/dashboards, exporting, and using AI
 * tooling.
 */
export const API_KEY_SCOPES = [
  'ingest.write',
  'schema.write',
  'metrics.write',
  'dashboards.write',
  'data.export',
  'ai.use',
] as const satisfies readonly Permission[];

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}
