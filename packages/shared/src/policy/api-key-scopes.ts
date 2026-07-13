import { type Permission } from './permissions';

/**
 * Permissions a machine-held API key (KAN-28) may carry as a scope. A
 * deliberate subset of the full `Permission` catalog, not the whole thing —
 * the same "least privilege for a non-human principal" reasoning
 * `INVITABLE_ROLES` (`roles.ts`) already applies to org invites. Withheld:
 * `project.manage`/`members.manage`/`billing.manage`/`resources.manage`/
 * `sources.manage` (org/project administration — a leaked long-lived key
 * should never be able to reshape who has access or which connectors/
 * sources exist), `keys.manage` (a key must not be able to mint or revoke
 * other keys), `automation.approve`/`automation.execute` (plan 06 §3:
 * "automation execution rights are a separate, elevated scope" — money-
 * moving actions need a human role, not a bearer token), `pii.read`
 * (plan 08 §5.4's separate PII gate), `plugin.install` (an install is an
 * admin action), and `audit.read` (KAN-44 — a key reading its own org's
 * change history is an admin/operator concern, not something a leaked
 * ingest key should expose). What's left is the machine-appropriate surface: pushing
 * data in, writing schemas/metrics/dashboards, exporting, and using AI
 * tooling. `mcp.read` (KAN-75 — the MCP server's read-tool surface) is
 * included: it is itself already a read-only, least-privilege grant (the
 * same reasoning that keeps `metrics.write` grantable despite its name —
 * there is no separate `*.read` permission in the catalog for any of these
 * surfaces). KAN-76's MCP act tools (`propose_action`/`approve_action`/
 * `create_goal`/`create_segment`) deliberately introduced no separate
 * `mcp.act` permission — each act tool instead re-checks its own
 * already-modeled permission (`automation.execute`/`automation.approve`/
 * `dashboards.write`) via `apps/api/src/mcp/mcp-act-authorization.ts`'s
 * `mcpCallerHasPermission`, so the withholding of `automation.approve`/
 * `automation.execute` above already covers `propose_action`/
 * `approve_action` for API keys with no new catalog entry needed.
 * `index.test.ts` pins this as a full partition of `PERMISSIONS` —
 * every permission is either here or in that withheld list, never neither
 * (silently un-grantable) nor both.
 */
export const API_KEY_SCOPES = [
  'ingest.write',
  'schema.write',
  'metrics.write',
  'dashboards.write',
  'data.export',
  'ai.use',
  'mcp.read',
] as const satisfies readonly Permission[];

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}
