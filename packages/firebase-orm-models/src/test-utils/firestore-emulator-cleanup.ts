import { afterAll } from 'vitest';
import { deleteApp, getApps } from 'firebase/app';

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
afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app).catch(() => undefined)));
});
