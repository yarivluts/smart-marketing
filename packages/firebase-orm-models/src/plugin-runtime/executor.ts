import type { SchemaDefKind } from '../models/schema-def.model';
import type { PluginRuntimeCredential } from './credential';

export interface SourcePluginSyncParams {
  organizationId: string;
  projectId: string;
  pluginId: string;
  /** The install's own `config` values, validated against the manifest's `config_schema` at install time (KAN-46). */
  config: Record<string, unknown>;
  credential: PluginRuntimeCredential;
  /** `null` means "sync from scratch" — this install has never completed a sync before. */
  cursor: string | null;
}

/**
 * One sync pass's output — a homogeneous batch of records of a single
 * `IngestBatchInput` kind, handed to `ingestBatch` verbatim by
 * `plugin-runtime.service.ts` (the exact same validation/dedup/quarantine
 * path a pushed Ingest API record goes through — a source plugin is just
 * another way records arrive, not a separate landing pipeline). `entityType`
 * is required alongside `records` when `kind === 'entity'`, mirroring
 * `IngestBatchInput`'s own per-kind shape.
 */
export interface SourcePluginSyncResult {
  kind: SchemaDefKind;
  /** Required (and only meaningful) when `kind === 'entity'` — the schema name every record in this batch validates against. */
  entityType?: string;
  records: readonly Record<string, unknown>[];
  /** The cursor to persist once this batch has been handed off — `null` is a legitimate "still nothing to advance past yet" value. */
  nextCursor: string | null;
}

/**
 * Thrown by a {@link SourcePluginExecutor} when one sync attempt fails —
 * carries a human-readable reason. `plugin-runtime.service.ts` retries this
 * with backoff before giving up (plan `13 §E7.2`'s "retry/backoff" AC).
 */
export class SourcePluginExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourcePluginExecutionError';
  }
}

/**
 * Actually runs one incremental sync pass for a source-plugin install — the
 * seam `plugin-runtime.service.ts`'s `triggerSourcePluginRun` calls, kept
 * provider-agnostic so a real per-plugin sandboxed workload (a container/V8
 * isolate calling out to Shopify/Stripe/etc., per plan `08 §4`'s "Runtime"
 * bullet) can slot in later without the run/cursor persistence machinery
 * around it changing — the same "buildable today, swap the provider later"
 * split `OrchestrationExecutor` (KAN-38) already established for its own
 * seam.
 */
export interface SourcePluginExecutor {
  sync(params: SourcePluginSyncParams): Promise<SourcePluginSyncResult>;
}

export interface SinkPluginPushParams {
  organizationId: string;
  projectId: string;
  pluginId: string;
  /** The install's own `config` values, validated against the manifest's `config_schema` at install time (KAN-46) — same posture as {@link SourcePluginSyncParams.config}. */
  config: Record<string, unknown>;
  credential: PluginRuntimeCredential;
  /** The rows to push this call — already resolved by the caller (e.g. a saved segment's own matching entity rows); a sink executor never queries the warehouse itself. */
  records: readonly Record<string, unknown>[];
}

/** One push call's outcome — how many of {@link SinkPluginPushParams.records} the remote system actually accepted. */
export interface SinkPluginPushResult {
  pushed: number;
}

/**
 * Thrown by a {@link SinkPluginExecutor} when one push attempt fails —
 * carries a human-readable reason, the exact mirror of
 * {@link SourcePluginExecutionError} for the outbound direction.
 */
export class SinkPluginExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SinkPluginExecutionError';
  }
}

/**
 * Actually pushes one batch of records out to an external system for an
 * action-type plugin install (KAN-81, plan `14 §Gap 5`: "export/sync to CRM
 * ... action plugin") — the outbound mirror of {@link SourcePluginExecutor}.
 * Kept provider-agnostic for the same "buildable today, swap the provider
 * later" reason {@link SourcePluginExecutor}'s own doc comment gives; unlike
 * the source side there is no cursor here — a push call is always handed an
 * already-resolved, complete batch by its caller (e.g. `syncSegmentToCrm`),
 * not an incremental window it must track itself.
 */
export interface SinkPluginExecutor {
  push(params: SinkPluginPushParams): Promise<SinkPluginPushResult>;
}
