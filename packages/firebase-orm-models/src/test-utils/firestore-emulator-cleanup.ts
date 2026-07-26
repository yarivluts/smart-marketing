import { afterAll } from 'vitest';
import { deleteApp, getApps } from 'firebase/app';
import { getFirestore, terminate } from 'firebase/firestore';

// Every `*.emulator.test.ts` file opens its own Firebase app (see
// `connectToFirestoreEmulator`) against the single Firestore emulator that
// `firebase emulators:exec` starts once for the whole `vitest run` — and,
// crucially, never closed it. Each of those client SDK connections keeps a
// gRPC "Listen" stream open for the lifetime of the process; with 40+ such
// files sharing one emulator, the accumulated open streams made the
// emulator's outgoing message size balloon over the course of a run
// (observed climbing from ~450MB to several GB) until it tripped gRPC's
// 4MB-default `RESOURCE_EXHAUSTED` limit and failed unrelated, later test
// files. This setup file (wired in via vitest's `setupFiles`, which reruns
// per test file under the default `isolate: true`) closes every Firebase
// app a file opened as soon as that file's tests finish, so the open-stream
// count never grows past what a single file needs at once.
//
// `terminate()` before `deleteApp()` (rather than `deleteApp()` alone) is
// deliberate: without it, a watch-stream message already in flight when the
// app is torn down can land on a half-closed client and trip the SDK's own
// `hardAssert` in its watch-change deserializer (`FIRESTORE INTERNAL
// ASSERTION FAILED: Unexpected state (ID: 27ce)`), surfaced as an unhandled
// rejection in CI a couple of times across 80+ runs, always in whichever
// test file happened to be running when it fired rather than the file whose
// app was mid-teardown. `terminate()` closes the network/watch stream
// gracefully and waits for it before `deleteApp()` runs.
afterAll(async () => {
  await Promise.all(
    getApps().map(async (app) => {
      await terminate(getFirestore(app)).catch(() => undefined);
      await deleteApp(app).catch(() => undefined);
    }),
  );
});
