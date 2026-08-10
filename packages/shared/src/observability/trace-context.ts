/**
 * Async-local trace id propagation, shared by apps/web and apps/api so a single
 * id can correlate a request's structured logs, its Sentry event, and the
 * response header a client (or another service) can hand back for support.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface TraceContext {
  traceId: string;
}

const storage = new AsyncLocalStorage<TraceContext>();

/** A 32-hex-char id, matching the W3C trace-context / OpenTelemetry trace id shape. */
export function generateTraceId(): string {
  return randomUUID().replace(/-/g, '');
}

/** Runs `fn` with `traceId` bound to async-local storage for its whole call graph. */
export function runWithTraceId<T>(traceId: string, fn: () => T): T {
  return storage.run({ traceId }, fn);
}

/** The trace id bound by the nearest enclosing `runWithTraceId`, if any. */
export function getTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}
