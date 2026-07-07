import { createHash } from 'node:crypto';
import { AuditLogEntryModel, type AuditActorType } from '../models/audit-log-entry.model';

/** Same load-bounding reasoning as `listRecentIngestBatchesForProject` — bounds query cost until a real aggregation store exists. */
export const DEFAULT_AUDIT_LOG_LIST_LIMIT = 200;

export interface RecordAuditLogEntryParams {
  organizationId: string;
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
}

/** The subset of an entry's fields that its `entry_hash` is computed over — every persisted field except `entry_hash` itself. */
interface HashableAuditLogEntry {
  organization_id: string;
  project_id?: string;
  environment_id?: string;
  actor_type: AuditActorType;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  created_at: string;
  prev_entry_hash: string;
}

/** Canonical JSON: keys sorted at every nesting level, so two logically-identical `before`/`after` snapshots that differ only in key order hash identically (same reasoning as `ingest.service.ts`'s own `canonicalize`, duplicated here rather than shared — a small, self-contained helper not worth a cross-package abstraction for). */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return value;
}

/**
 * Builds the exact content object a hash is computed over, omitting every
 * optional field that's absent rather than setting it to `undefined` — so
 * the same logical entry hashes identically whether it's freshly built from
 * `RecordAuditLogEntryParams` or read back from a persisted
 * `AuditLogEntryModel`. Exported (but not re-exported from this package's
 * `index.ts`) purely so this file's own emulator test can construct a
 * genuine chain-fork scenario without duplicating the hashing logic.
 */
export function buildHashableContent(input: {
  organization_id: string;
  project_id?: string;
  environment_id?: string;
  actor_type: AuditActorType;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  created_at: string;
  prev_entry_hash: string;
}): HashableAuditLogEntry {
  return {
    organization_id: input.organization_id,
    ...(input.project_id !== undefined ? { project_id: input.project_id } : {}),
    ...(input.environment_id !== undefined ? { environment_id: input.environment_id } : {}),
    actor_type: input.actor_type,
    actor_id: input.actor_id,
    action: input.action,
    target_type: input.target_type,
    target_id: input.target_id,
    summary: input.summary,
    ...(input.before !== undefined ? { before: input.before } : {}),
    ...(input.after !== undefined ? { after: input.after } : {}),
    created_at: input.created_at,
    prev_entry_hash: input.prev_entry_hash,
  };
}

/** Exported for the same test-only reason as {@link buildHashableContent}. */
export function computeEntryHash(content: HashableAuditLogEntry): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(content))).digest('hex');
}

/**
 * Appends one entry to an org's audit-log chain (KAN-44 AC: "every config/
 * key/role/schema change"). Reads the org's current newest entry to link
 * onto it (`prev_entry_hash`), then writes a new entry whose own `entry_hash`
 * commits to its content plus that link — see the model's own doc comment
 * for what this buys.
 *
 * Not transactional, the same documented, deliberately-deferred tradeoff as
 * `schema-registry.service.ts`'s active-version read: two genuinely
 * concurrent calls for the same org can both read the same "latest" entry
 * before either writes, producing two entries that both link onto it (a
 * benign fork from a liveness race, not tampering) rather than a strictly
 * linear chain. `verifyAuditLogChainForOrg` treats that case as a broken
 * link, indistinguishable by itself from real tampering — see its own doc
 * comment.
 *
 * Callers are expected to treat this as best-effort (wrap in a try/catch)
 * the same way every other secondary side-effect write in this codebase
 * does (dedup-key claims, pipeline publish): a failure to record an audit
 * entry must never turn an otherwise-successful admin action into an error
 * for the caller.
 */
export async function recordAuditLogEntry(params: RecordAuditLogEntryParams): Promise<AuditLogEntryModel> {
  const latest = await AuditLogEntryModel.initPath({ organization_id: params.organizationId })
    .query()
    .orderBy('created_at', 'desc')
    .limit(1)
    .get();

  const content = buildHashableContent({
    organization_id: params.organizationId,
    project_id: params.projectId,
    environment_id: params.environmentId,
    actor_type: params.actorType,
    actor_id: params.actorId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    summary: params.summary,
    before: params.before,
    after: params.after,
    created_at: new Date().toISOString(),
    prev_entry_hash: latest[0]?.entry_hash ?? '',
  });

  const entry = new AuditLogEntryModel();
  entry.organization_id = content.organization_id;
  if (content.project_id !== undefined) entry.project_id = content.project_id;
  if (content.environment_id !== undefined) entry.environment_id = content.environment_id;
  entry.actor_type = content.actor_type;
  entry.actor_id = content.actor_id;
  entry.action = content.action;
  entry.target_type = content.target_type;
  entry.target_id = content.target_id;
  entry.summary = content.summary;
  if (content.before !== undefined) entry.before = content.before;
  if (content.after !== undefined) entry.after = content.after;
  entry.created_at = content.created_at;
  entry.prev_entry_hash = content.prev_entry_hash;
  entry.entry_hash = computeEntryHash(content);
  entry.setPathParams({ organization_id: params.organizationId });
  await entry.save();
  return entry;
}

/** Every audit entry for an org, newest first (KAN-44 AC: "visible in admin UI (basic list)"). Not scoped to one project — an org's audit trail folds every project's key/schema changes together with org-level membership/role changes, same "one admin view" posture as `listApiKeysForProject`'s cross-environment listing. */
export async function listAuditLogEntriesForOrg(
  organizationId: string,
  limit: number = DEFAULT_AUDIT_LOG_LIST_LIMIT,
): Promise<AuditLogEntryModel[]> {
  return AuditLogEntryModel.initPath({ organization_id: organizationId })
    .query()
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();
}

export interface AuditLogChainVerification {
  valid: boolean;
  entryCount: number;
  /** The first entry (oldest-to-newest) where verification failed, if any. */
  brokenAtEntryId?: string;
  /**
   * `hash_mismatch`: this entry's own stored `entry_hash` no longer matches
   * a recomputation over its stored content — its content (or its
   * `entry_hash`) was edited after the fact. `chain_break`: this entry's
   * `prev_entry_hash` doesn't match the previous entry's `entry_hash` — real
   * tampering (a deleted or reordered entry) or a benign concurrent-append
   * fork (see `recordAuditLogEntry`'s doc comment) can both produce this;
   * distinguishing the two needs human judgment, not something this function
   * can determine on its own.
   */
  reason?: 'hash_mismatch' | 'chain_break';
}

/**
 * Recomputes every entry's own hash and chain link for an org, oldest first,
 * and reports the first entry (if any) where verification fails — the
 * concrete check behind KAN-44's "tamper-evident" AC. Reads every entry the
 * org has ever recorded rather than paging, since a partial verification
 * would silently miss tampering in the unread tail.
 */
export async function verifyAuditLogChainForOrg(organizationId: string): Promise<AuditLogChainVerification> {
  const entries = await AuditLogEntryModel.initPath({ organization_id: organizationId })
    .query()
    .orderBy('created_at', 'asc')
    .get();

  for (const [index, entry] of entries.entries()) {
    const content = buildHashableContent(entry);
    if (computeEntryHash(content) !== entry.entry_hash) {
      return { valid: false, entryCount: entries.length, brokenAtEntryId: entry.id, reason: 'hash_mismatch' };
    }
    if (index > 0 && entry.prev_entry_hash !== entries[index - 1].entry_hash) {
      return { valid: false, entryCount: entries.length, brokenAtEntryId: entry.id, reason: 'chain_break' };
    }
  }

  return { valid: true, entryCount: entries.length };
}
