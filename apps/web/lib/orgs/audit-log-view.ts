import type { AuditActorType, AuditLogEntryModel } from '@growthos/firebase-orm-models';

export interface AuditLogEntryView {
  id: string;
  projectId?: string;
  environmentId?: string;
  actorType: AuditActorType;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

/**
 * An `AuditLogEntryModel` instance doesn't serialize cleanly through
 * `NextResponse.json` (its `id` is backed by a getter, the same reason every
 * other route in this codebase returns a mapped plain object instead of the
 * raw model) — the shared mapping for the audit-log route and page. Never
 * includes `prev_entry_hash`/`entry_hash`: those are an internal integrity
 * mechanism (see `verifyAuditLogChainForOrg`), not something the admin UI's
 * basic list needs to render.
 */
export function toAuditLogEntryView(entry: AuditLogEntryModel): AuditLogEntryView {
  return {
    id: entry.id,
    projectId: entry.project_id,
    environmentId: entry.environment_id,
    actorType: entry.actor_type,
    actorId: entry.actor_id,
    action: entry.action,
    targetType: entry.target_type,
    targetId: entry.target_id,
    summary: entry.summary,
    before: entry.before,
    after: entry.after,
    createdAt: entry.created_at,
  };
}
