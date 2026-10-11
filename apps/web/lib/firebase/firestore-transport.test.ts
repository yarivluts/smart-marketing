import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { connectFirestoreOrmAdmin } from '@growthos/firebase-orm-models';

/**
 * Pins the two environment facts that decide which Firestore transport this
 * app's tests run on. One of them was asserted in a doc comment, believed for
 * weeks, and is false — which is why every emulator-backed API route test ran
 * on the transport KAN-103 is about, for as long as it was believed they did
 * not (KAN-165).
 *
 * This test lives under `lib/`, so it keeps the jsdom environment that the
 * route tests have now left. That is deliberate: it is asserting what jsdom
 * does, and it has to run there to do that.
 */
describe('what jsdom actually does to the Firestore transport', () => {
  /**
   * The false claim. `ensureFirestoreOrm` kept a `typeof window === 'undefined'`
   * branch on the reasoning that jsdom resolves the client SDK's *browser*
   * build, where `experimentalForceLongPolling` swaps gRPC for HTTP
   * long-polling and so avoids the corrupted `Listen` stream.
   *
   * jsdom supplies DOM globals. It does not change module resolution
   * conditions, so the gRPC build is what loads, and that build reads
   * `forceLongPolling` onto its database info and never consults it — the
   * option is honoured only by the browser build's WebChannel transport.
   *
   * Asserted against the environment rather than our own code, because our code
   * can no longer tell: the route tests now run in `node` and never reach this
   * branch. If vitest ever does start resolving browser conditions, that is
   * worth learning here rather than through a flake.
   */
  it('resolves the gRPC node build, not the browser build, despite window existing', () => {
    const resolved = createRequire(import.meta.url).resolve('firebase/firestore').replace(/\\/g, '/');

    expect({ hasWindow: typeof window !== 'undefined' }).toEqual({ hasWindow: true });
    expect({ resolvesBrowserBuild: /\/dist\/(browser|esm)\//.test(resolved), resolved }).toEqual({
      resolvesBrowserBuild: false,
      resolved,
    });
  });

  /**
   * The claim that DOES hold, and the reason the fix is the test environment
   * rather than simply always using the Admin SDK.
   *
   * Worth pinning precisely because it is easy to get wrong in the reassuring
   * direction: `firebase-admin`'s own `initializeApp` initializes perfectly well
   * under jsdom, so a probe against the raw package says "Admin works here". The
   * ORM's `initializeAdminApp` is the one that actually gets called, and it
   * carries its own browser guard. Measuring the wrong function is how you
   * conclude a branch can be deleted when it cannot.
   */
  it('refuses to connect the Admin SDK, which is why the fix is the environment and not the branch', async () => {
    await expect(connectFirestoreOrmAdmin({ projectId: 'demo-growthos-test' })).rejects.toThrow(/Node\.js environment/i);
  });
});
