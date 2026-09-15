import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the emulator transport choice, which has silently cost CI reruns.
 *
 * The client SDK's default gRPC transport multiplexes every read — even a one-shot
 * `getDocs()` — as a target on one shared `Listen` stream per Firestore instance. Across a
 * suite of emulator-backed files sharing one emulator, the accumulated target state on that
 * stream grows until it trips gRPC's 4MB limit, and it surfaces as a nonsense
 * `RESOURCE_EXHAUSTED: Received message larger than max (2812728582 vs 4194304)` on whichever
 * test happened to be reading. `experimentalForceLongPolling` issues one request per read and
 * accumulates nothing.
 *
 * There are two places that connect to the emulator, and the fix was applied to only one.
 * `test-utils/emulator.ts` got it; `firestore-connection.ts` did not, so everything routed
 * through `connectFirestoreOrm` — apps/web's `lib/orgs` suites and every apps/api e2e spec —
 * stayed on gRPC and kept flaking long after the problem was believed fixed. Asserting both
 * files together is the point: the failure mode is one of them drifting from the other.
 *
 * Deliberately a source-level check. Proving the transport behaviourally would mean asserting
 * on SDK internals, and the regression this protects against is textual — an edit that drops
 * the option, or a third connection path added without it.
 */
const sourceOf = (relativePath: string): string =>
  readFileSync(resolve(__dirname, relativePath), 'utf8');

describe('emulator connections force the long-polling transport', () => {
  it('connectFirestoreOrm uses long polling when pointed at the emulator', () => {
    const source = sourceOf('./firestore-connection.ts');
    expect(source).toContain('experimentalForceLongPolling: true');
    // Only for the emulator: production keeps gRPC, which is the faster transport, and the
    // problem is specific to many short-lived test connections against one shared emulator.
    expect(source).toMatch(/options\.emulatorHost\s*\?[\s\S]{0,120}experimentalForceLongPolling/);
    expect(source).toContain('getFirestore(app)');
  });

  it('the test-utils bootstrap keeps the same setting', () => {
    expect(sourceOf('./test-utils/emulator.ts')).toContain('experimentalForceLongPolling: true');
  });
});
