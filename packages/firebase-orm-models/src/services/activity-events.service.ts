import type { PushEventSource } from '@growthos/shared';

/**
 * The one place product updates a person may want to hear about are announced: every Growth Pilot
 * feed line (`recordGrowthActivity`) and every Ad Studio autopilot run that stops to wait, finishes
 * or fails (`saveAdStudioRunProgress`). Listeners (the web app's push sender) subscribe here, so a
 * new event recorded through those paths reaches them without touching the sender.
 *
 * Delivery is best-effort and bounded: a listener's error is swallowed, and the caller waits at
 * most {@link ACTIVITY_EVENT_WAIT_MS} - the underlying write has already happened and must never
 * fail or stall because a notification could not be sent.
 */
export interface ActivityEvent {
  source: PushEventSource;
  /** A `GrowthActivityKind`, `video_ready`/`video_failed`, or `run_awaiting_approval`/`run_done`/`run_failed`. */
  kind: string;
  organizationId: string;
  projectId: string;
  /** `pilot` / `autopilot` when it happened by itself, otherwise the user id of the person whose action this was. */
  actor: string;
  subject?: string | null;
  count?: number | null;
  /** The Ad Studio brief the event is about, when it is about one. */
  briefId?: string | null;
}

export type ActivityEventListener = (event: ActivityEvent) => Promise<void> | void;

/** The longest a recording call waits for its listeners before moving on. */
export const ACTIVITY_EVENT_WAIT_MS = 4_000;

// Kept on globalThis: a bundler may load this module more than once (one copy per server entry),
// and a listener registered through one copy must still hear events emitted through another.
const REGISTRY_KEY = Symbol.for('growthos.activityEventListeners');

function registry(): Map<string, ActivityEventListener> {
  const holder = globalThis as unknown as Record<symbol, Map<string, ActivityEventListener> | undefined>;
  let listeners = holder[REGISTRY_KEY];
  if (!listeners) {
    listeners = new Map();
    holder[REGISTRY_KEY] = listeners;
  }
  return listeners;
}

/** Registers (or replaces, by `name`) a listener; returns a function that removes it. */
export function setActivityEventListener(name: string, listener: ActivityEventListener): () => void {
  registry().set(name, listener);
  return () => {
    if (registry().get(name) === listener) registry().delete(name);
  };
}

export function hasActivityEventListener(name: string): boolean {
  return registry().has(name);
}

/** Tells every listener; never throws, and returns after at most `waitMs`. */
export async function emitActivityEvent(event: ActivityEvent, waitMs = ACTIVITY_EVENT_WAIT_MS): Promise<void> {
  const listeners = [...registry().values()];
  if (listeners.length === 0) return;
  const all = Promise.all(
    listeners.map(async (listener) => {
      try {
        await listener(event);
      } catch {
        // Best-effort: a notification that could not be sent never fails the update itself.
      }
    }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  try {
    await Promise.race([all, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
