import { can, type Permission, type PolicyBinding } from '@growthos/shared';
import { listRoleBindingsForUser } from '@growthos/firebase-orm-models';
import type { McpAuthContext } from './mcp-auth.guard';

/** Mirrors `mcp-oauth.service.ts`'s own private `toPolicyBindings` — kept local rather than imported/exported across the package boundary since it's a five-line adapter, not shared logic. */
function toPolicyBindings(bindings: Awaited<ReturnType<typeof listRoleBindingsForUser>>): PolicyBinding[] {
  return bindings.map((binding) => ({
    principalType: binding.principal_type,
    principalId: binding.principal_id,
    role: binding.role,
    scopeLevel: binding.scope_level,
    scopeId: binding.scope_id,
  }));
}

/**
 * Whether an authenticated MCP caller currently holds `permission` for its
 * connection's org/project — the extra, tool-specific gate every KAN-76 act
 * tool checks beyond the connection-level `mcp.read` the guard already
 * requires just to open a connection at all (the same "loose at connection
 * time, strict per call" split the read tools establish, just against a
 * different permission per tool instead of one shared one).
 *
 * The two credential kinds are checked differently, on purpose:
 * - `api_key`: checked directly against the key's own static `scopes` array
 *   (KAN-28) — a key has no granting human to re-derive a live decision
 *   from. `automation.approve`/`automation.execute` are permanently withheld
 *   from `API_KEY_SCOPES` (`packages/shared/src/policy/api-key-scopes.ts`),
 *   so an API-key-authenticated `propose_action`/`approve_action` call can
 *   never satisfy this check — that is by design, not a bug: those actions
 *   need a human role, not a bearer token (plan `06 §3`).
 * - `oauth`: re-derived fresh from the granting human's *current* role
 *   bindings via `can()`, independent of the grant's own `scope` field
 *   (always `mcp:read` today, per `mcp-oauth.service.ts`) — the same "MCP
 *   grants nothing the underlying principal doesn't have" posture
 *   `currentUserHasMcpReadPermission` already establishes for the read
 *   surface, extended here to whichever specific permission an act tool
 *   needs. A role change or membership removal since the OAuth grant was
 *   issued takes effect on the very next act-tool call.
 */
export async function mcpCallerHasPermission(auth: McpAuthContext, permission: Permission): Promise<boolean> {
  if (auth.principalKind === 'api_key') {
    return ((auth.scopes ?? []) as readonly string[]).includes(permission);
  }
  if (!auth.userId) {
    return false;
  }
  const bindings = await listRoleBindingsForUser(auth.userId, [auth.organizationId]);
  return can(toPolicyBindings(bindings), { type: 'user', id: auth.userId }, permission, {
    orgId: auth.organizationId,
    projectId: auth.projectId,
  });
}
