import { createHash } from 'node:crypto';
import { AuditLogEntryModel, type AuditActorType, type AuditClientType } from '../models/audit-log-entry.model';

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
  clientType?: AuditClientType;
  clientId?: string;
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
  client_type?: AuditClientType;
  client_id?: string;
  created_at: string;
  seq?: number;
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
  client_type?: AuditClientType;
  client_id?: string;
  created_at: string;
  seq?: number;
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
    ...(input.client_type !== undefined ? { client_type: input.client_type } : {}),
    ...(input.client_id !== undefined ? { client_id: input.client_id } : {}),
    created_at: input.created_at,
    // Omitted when absent, so every entry written before `seq` existed still hashes exactly as it did.
    ...(typeof input.seq === 'number' ? { seq: input.seq } : {}),
    prev_entry_hash: input.prev_entry_hash,
  };
}

/** Exported for the same test-only reason as {@link buildHashableContent}. */
export function computeEntryHash(content: HashableAuditLogEntry): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(content))).digest('hex');
}


/**
 * Appends still in flight per org, in this process. `recordAuditLogEntry` is a
 * read-the-head-then-write sequence with no transaction (`@arbel/firebase-orm`
 * exposes none), so two appends for one org that overlap both read the same
 * head and both link onto it: a fork. Callers routinely do overlap - plugin
 * installs register a pack's metrics with `Promise.all`, each of which records
 * its own entry - which is exactly what forked prod's chains (KAN-44
 * follow-up: 13 `metric_def.register` entries written within 37ms of each other
 * all linking onto one `schema_def.register`). Queuing appends per org removes
 * that whole class; appends from *different* processes can still race, and the
 * verifier reports those as forks rather than as tampering.
 */
const appendQueues = new Map<string, Promise<void>>();

function serializeAppendForOrg<T>(organizationId: string, task: () => Promise<T>): Promise<T> {
  // The stored tail never rejects (see `settled`), so a failed append never blocks the next one.
  const previous = appendQueues.get(organizationId) ?? Promise.resolve();
  const run = previous.then(task);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  appendQueues.set(organizationId, settled);
  void settled.then(() => {
    if (appendQueues.get(organizationId) === settled) {
      appendQueues.delete(organizationId);
    }
  });
  return run;
}

/**
 * The entry a new append links onto, and the `seq` the new entry takes. Picked
 * by `seq`, never by `created_at`: `created_at` is the writing host's wall
 * clock, and apps/web, apps/api and workers disagree by up to tens of seconds
 * (prod shows `mcp.tool_call` entries timestamped 44s *after* the
 * `api_key.revoke` entries that were appended after them). Ordering by it picks
 * an entry that is not the most recent append and forks the chain. Orgs whose
 * entries all predate `seq` fall back to the newest by `created_at` once, for
 * the first `seq`-carrying entry.
 */
async function findChainHead(organizationId: string): Promise<{ prevEntryHash: string; seq: number }> {
  const [bySeq] = await AuditLogEntryModel.initPath({ organization_id: organizationId }).query().orderBy('seq', 'desc').limit(1).get();
  if (bySeq && typeof bySeq.seq === 'number') {
    return { prevEntryHash: bySeq.entry_hash, seq: bySeq.seq + 1 };
  }
  const [legacy] = await AuditLogEntryModel.initPath({ organization_id: organizationId }).query().orderBy('created_at', 'desc').limit(1).get();
  return { prevEntryHash: legacy?.entry_hash ?? '', seq: 1 };
}

/**
 * Appends one entry to an org's audit-log chain (KAN-44 AC: "every config/
 * key/role/schema change"). Reads the org's chain head to link onto it
 * (`prev_entry_hash`, `seq`), then writes a new entry whose own `entry_hash`
 * commits to its content plus that link — see the model's own doc comment
 * for what this buys.
 *
 * Appends for one org are queued within this process (see `appendQueues`), so
 * concurrent callers in one request or one server produce a linear chain.
 * There is still no cross-process transaction: two hosts appending for the
 * same org at the same instant can both link onto the same head, a benign
 * fork that `verifyAuditLogChain` reports as such, not as tampering.
 *
 * Callers are expected to treat this as best-effort (wrap in a try/catch)
 * the same way every other secondary side-effect write in this codebase
 * does (dedup-key claims, pipeline publish): a failure to record an audit
 * entry must never turn an otherwise-successful admin action into an error
 * for the caller.
 */
export async function recordAuditLogEntry(params: RecordAuditLogEntryParams): Promise<AuditLogEntryModel> {
  return serializeAppendForOrg(params.organizationId, () => appendAuditLogEntry(params));
}

async function appendAuditLogEntry(params: RecordAuditLogEntryParams): Promise<AuditLogEntryModel> {
  const head = await findChainHead(params.organizationId);

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
    client_type: params.clientType,
    client_id: params.clientId,
    created_at: new Date().toISOString(),
    seq: head.seq,
    prev_entry_hash: head.prevEntryHash,
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
  if (content.client_type !== undefined) entry.client_type = content.client_type;
  if (content.client_id !== undefined) entry.client_id = content.client_id;
  entry.created_at = content.created_at;
  entry.seq = content.seq;
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

/** Enough about one entry for a person to find it and judge it — no `before`/`after` payloads, no hashes. */
export interface AuditLogChainEntryRef {
  id: string;
  action: string;
  createdAt: string;
  actorType: AuditActorType;
  actorId: string;
}

/**
 * Two or more entries that all link onto the same parent: they were appended
 * at the same moment by writers that each read the same chain head (see
 * `recordAuditLogEntry`). Each branch entry is still individually verified -
 * its own hash recomputes and its parent exists - so a fork is not evidence of
 * an edit or a deletion. What it weakens: like the newest entry of any hash
 * chain, an entry at the tip of a side branch could be removed without leaving
 * a trace.
 */
export interface AuditLogChainFork {
  /** The entry the branches link onto; absent when the branches are several "first" entries (empty `prev_entry_hash`). */
  parent?: AuditLogChainEntryRef;
  /** Every entry linking onto `parent`, oldest first. */
  branches: AuditLogChainEntryRef[];
}

export interface AuditLogChainVerification {
  /** False only on evidence that a stored entry was edited or that an entry other entries depend on is gone. */
  valid: boolean;
  entryCount: number;
  /** The first entry (oldest-to-newest by `created_at`) where verification failed, if any. */
  brokenAtEntryId?: string;
  /** Details of {@link brokenAtEntryId}, so the admin UI can identify it without a second lookup. */
  brokenEntry?: AuditLogChainEntryRef;
  /**
   * `hash_mismatch`: this entry's own stored `entry_hash` no longer matches
   * a recomputation over its stored content — its content (or its
   * `entry_hash`) was edited after the fact. `chain_break`: this entry's
   * `prev_entry_hash` matches no stored entry (the entry it was appended after
   * was deleted, or edited and re-hashed), or its `seq` does not follow its
   * parent's. Neither can be produced by a concurrent append; both mean a
   * stored record changed outside `recordAuditLogEntry`.
   */
  reason?: 'hash_mismatch' | 'chain_break';
  /** Concurrent-append forks, oldest first. Present (possibly empty) whenever verification ran; not a failure. */
  forks: AuditLogChainFork[];
}

/** The persisted fields verification reads. */
export type VerifiableAuditLogEntry = Pick<
  AuditLogEntryModel,
  | 'organization_id'
  | 'project_id'
  | 'environment_id'
  | 'actor_type'
  | 'actor_id'
  | 'action'
  | 'target_type'
  | 'target_id'
  | 'summary'
  | 'before'
  | 'after'
  | 'client_type'
  | 'client_id'
  | 'created_at'
  | 'seq'
  | 'prev_entry_hash'
  | 'entry_hash'
> & { id: string };

function toEntryRef(entry: VerifiableAuditLogEntry): AuditLogChainEntryRef {
  return { id: entry.id, action: entry.action, createdAt: entry.created_at, actorType: entry.actor_type, actorId: entry.actor_id };
}

function compareByCreatedAt(a: VerifiableAuditLogEntry, b: VerifiableAuditLogEntry): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Verifies an org's entries as the tree their links actually form, not as a
 * list sorted by `created_at`. The previous verifier compared each entry with
 * whichever entry preceded it by `created_at` and reported a `chain_break` on
 * any mismatch - so two entries appended concurrently (both linking onto one
 * parent) or written by hosts whose clocks disagree (a child timestamped
 * before its parent) read as tampering. Prod org JGTxet9aGXV6xUPWYidR showed 46
 * such "breaks" across 717 entries with zero self-hash mismatches and zero
 * missing parents: every one was a fork, none an edit.
 *
 * Checks, per entry: its `entry_hash` recomputes from its stored content
 * (`hash_mismatch` otherwise); its `prev_entry_hash` is empty or names a
 * stored entry (`chain_break` otherwise); when it carries `seq`, that is its
 * parent's `seq` + 1, or 1 under a parent without one (`chain_break`
 * otherwise). Parents with several children are reported as forks.
 */
export function verifyAuditLogChain(entries: readonly VerifiableAuditLogEntry[]): AuditLogChainVerification {
  const ordered = [...entries].sort(compareByCreatedAt);
  const byHash = new Map<string, VerifiableAuditLogEntry>();
  for (const entry of ordered) {
    if (!byHash.has(entry.entry_hash)) byHash.set(entry.entry_hash, entry);
  }

  let failure: { entry: VerifiableAuditLogEntry; reason: 'hash_mismatch' | 'chain_break' } | undefined;
  const childrenByParentHash = new Map<string, VerifiableAuditLogEntry[]>();
  for (const entry of ordered) {
    if (computeEntryHash(buildHashableContent(entry)) !== entry.entry_hash) {
      failure ??= { entry, reason: 'hash_mismatch' };
      continue;
    }
    const parent = entry.prev_entry_hash === '' ? undefined : byHash.get(entry.prev_entry_hash);
    if (entry.prev_entry_hash !== '' && !parent) {
      failure ??= { entry, reason: 'chain_break' };
      continue;
    }
    if (typeof entry.seq === 'number' && entry.seq !== (typeof parent?.seq === 'number' ? parent.seq + 1 : 1)) {
      failure ??= { entry, reason: 'chain_break' };
      continue;
    }
    const siblings = childrenByParentHash.get(entry.prev_entry_hash);
    if (siblings) siblings.push(entry);
    else childrenByParentHash.set(entry.prev_entry_hash, [entry]);
  }

  const forks: AuditLogChainFork[] = [];
  for (const [parentHash, children] of childrenByParentHash) {
    if (children.length < 2) continue;
    const parent = parentHash === '' ? undefined : byHash.get(parentHash);
    forks.push({ ...(parent ? { parent: toEntryRef(parent) } : {}), branches: children.map(toEntryRef) });
  }

  if (failure) {
    return {
      valid: false,
      entryCount: entries.length,
      brokenAtEntryId: failure.entry.id,
      brokenEntry: toEntryRef(failure.entry),
      reason: failure.reason,
      forks,
    };
  }
  return { valid: true, entryCount: entries.length, forks };
}

/**
 * Loads every entry an org has ever recorded and runs {@link verifyAuditLogChain}
 * over them — the concrete check behind KAN-44's "tamper-evident" AC. Reads
 * the whole log rather than paging, since a partial verification would
 * silently miss tampering in the unread tail.
 */
export async function verifyAuditLogChainForOrg(organizationId: string): Promise<AuditLogChainVerification> {
  const entries = await AuditLogEntryModel.initPath({ organization_id: organizationId })
    .query()
    .orderBy('created_at', 'asc')
    .get();
  return verifyAuditLogChain(entries);
}
