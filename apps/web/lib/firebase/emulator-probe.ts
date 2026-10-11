import net from 'node:net';

/** How long to wait for the emulator's TCP port to accept a connection before declaring it absent. Generous enough for a cold emulator that is still binding its port, short enough that a genuinely absent one fails in about a second rather than in minutes. */
export const EMULATOR_PROBE_TIMEOUT_MS = 1500;

export interface EmulatorAddress {
  host: string;
  port: number;
}

/**
 * Splits a `FIRESTORE_EMULATOR_HOST` value into host and port.
 *
 * Splits on the LAST colon so a bracketed IPv6 literal (`[::1]:8090`) keeps its
 * address intact; the brackets are stripped because `net.connect` wants the bare
 * address. Returns `undefined` rather than throwing for anything it cannot read,
 * so a malformed value degrades to "skip the probe and let the SDK speak for
 * itself" instead of replacing a real connection error with a parsing one.
 */
export function parseEmulatorHost(value: string): EmulatorAddress | undefined {
  const trimmed = value.trim();
  const separator = trimmed.lastIndexOf(':');
  if (separator <= 0 || separator === trimmed.length - 1) {
    return undefined;
  }
  const port = Number(trimmed.slice(separator + 1));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return undefined;
  }
  const host = trimmed.slice(0, separator).replace(/^\[|\]$/g, '');
  return host ? { host, port } : undefined;
}

/** The message a developer sees instead of a ten-minute hang. It names the command that works, because "emulator not running" on its own still leaves them guessing which of several test scripts starts one. */
export function emulatorUnreachableMessage(value: string): string {
  return [
    `Firestore emulator is not reachable at ${value}.`,
    'These tests run against a real emulator, so `vitest run` on its own cannot pass.',
    'Use `pnpm test:unit:emulator` (or `pnpm test`), which wraps vitest in `firebase emulators:exec`.',
  ].join(' ');
}

/** Resolves true when something is accepting TCP connections at `address`. */
export function isEmulatorReachable(
  address: EmulatorAddress,
  timeoutMs: number = EMULATOR_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: address.host, port: address.port });
    let settled = false;
    const finish = (reachable: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/**
 * Fails fast when `FIRESTORE_EMULATOR_HOST` points at nothing.
 *
 * Without this, a missing emulator is not a clean error: the Firestore client
 * SDK retries with its own backoff, so `win-feed-stream.test.ts` sits for the
 * full ten minutes of its stream deadline before anything is reported, and what
 * is finally reported is a pile of assertion failures that say nothing about the
 * emulator. A one-second TCP probe converts that into a single sentence naming
 * the command to run instead.
 */
export async function assertEmulatorReachable(
  value: string,
  timeoutMs: number = EMULATOR_PROBE_TIMEOUT_MS,
): Promise<void> {
  const address = parseEmulatorHost(value);
  if (!address) {
    return;
  }
  if (!(await isEmulatorReachable(address, timeoutMs))) {
    throw new Error(emulatorUnreachableMessage(value));
  }
}
