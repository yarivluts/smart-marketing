import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * Who performed an audited action. `api_key`/`system` cover machine-initiated
 * changes (e.g. a scheduled worker) that have no `Principal` of their own
 * (`@growthos/shared`'s `PrincipalType` only covers `user`/`service_account`,
 * the policy engine's own vocabulary — this is a separate, broader concept).
 */
export const AUDIT_ACTOR_TYPES = ['user', 'service_account', 'api_key', 'system'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/**
 * The connecting *client's* identity, distinct from `actor_type`/`actor_id` (KAN-77 AC: "every
 * [MCP] tool call lands in the audit log with the principal + client identity"). For an MCP API-key
 * call the key already fully identifies both the principal and the client, so `client_id` mirrors
 * `actor_id`; for an MCP OAuth call the *principal* is the granting human (`actor_id`) but the
 * *client* is the third-party application that human authorized (the grant's own `client_id`) —
 * a distinct piece of information `actor_id` alone can't recover. Undefined for every non-MCP entry.
 */
export const AUDIT_CLIENT_TYPES = ['mcp_api_key', 'mcp_oauth'] as const;
export type AuditClientType = (typeof AUDIT_CLIENT_TYPES)[number];

/**
 * One append-only audit record (KAN-44, plan `13 §E6.2`: "every config/key/
 * role/schema change"; `06 §1`/`§7`: "who/what/when/before/after"). Org-scoped
 * rather than project-scoped since an org's audit trail spans both org-level
 * changes (membership/role grants) and every project under it (keys, schema
 * defs) — `project_id`/`environment_id` are recorded per entry when the
 * action was scoped narrower than the org.
 *
 * `entry_hash`/`prev_entry_hash` form an append-only hash chain (see
 * `audit-log.service.ts`'s `recordAuditLogEntry`/`verifyAuditLogChainForOrg`)
 * — the concrete mechanism behind the AC's "tamper-evident": editing any
 * already-written entry's fields (directly in a Firestore dump, bypassing
 * this service entirely) changes what its own `entry_hash` must recompute to,
 * which no longer matches what's stored, and breaks the link the *next*
 * entry recorded to the value that used to be there.
 */
@Model({
  reference_path: 'organizations/:organization_id/audit_log_entries',
  path_id: 'audit_log_entry_id',
})
export class AuditLogEntryModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: false })
  public project_id?: string;

  @Field({ is_required: false })
  public environment_id?: string;

  @Field({ is_required: true })
  public actor_type!: AuditActorType;

  /** The acting principal's id — a `UserModel`/`ServiceAccountModel`/`ApiKeyModel` id, or `'system'`. */
  @Field({ is_required: true })
  public actor_id!: string;

  /** A dot-namespaced verb, e.g. `api_key.mint`, `schema_def.evolve`, `membership.removed`. */
  @Field({ is_required: true })
  public action!: string;

  /** The kind of resource changed, e.g. `api_key`, `schema_def`, `membership`. */
  @Field({ is_required: true })
  public target_type!: string;

  @Field({ is_required: true })
  public target_id!: string;

  /** A one-line human-readable description — what the admin UI's basic list actually renders. */
  @Field({ is_required: true })
  public summary!: string;

  /** A snapshot of the changed fields before the action, when there was a meaningful "before" (omitted for pure creations). */
  @Field({ is_required: false })
  public before?: Record<string, unknown>;

  /** A snapshot of the changed fields after the action, when there's a meaningful "after" (omitted for pure deletions). */
  @Field({ is_required: false })
  public after?: Record<string, unknown>;

  /** Set only when this action was performed through a channel with its own distinct client identity (currently: MCP) — see {@link AuditClientType}'s own doc comment. */
  @Field({ is_required: false })
  public client_type?: AuditClientType;

  /** The client's own id — an `ApiKeyModel` id (`client_type: 'mcp_api_key'`) or an `McpOAuthClientModel` id (`client_type: 'mcp_oauth'`). Undefined whenever `client_type` is. */
  @Field({ is_required: false })
  public client_id?: string;

  @Field({ is_required: true })
  public created_at!: string;

  /** The chain-preceding entry's own `entry_hash` for this org, or `''` for that org's very first entry. */
  @Field({ is_required: true })
  public prev_entry_hash!: string;

  /** `sha256` over this entry's own content (every field above except this one) chained onto `prev_entry_hash`. */
  @Field({ is_required: true })
  public entry_hash!: string;
}
