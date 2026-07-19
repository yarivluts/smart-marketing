import { initializeApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, getDocs, initializeFirestore } from 'firebase/firestore';
import { FirestoreOrmRepository } from '@arbel/firebase-orm';

/**
 * Connects the ORM's global Firestore connection to the local emulator
 * started by `firebase emulators:exec` (see this package's `test` script and
 * `firebase.json`). Must match the `--project` flag passed to that command.
 */
const EMULATOR_PROJECT_ID = 'demo-growthos-test';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8080;
const WARMUP_ATTEMPTS = 20;
const WARMUP_RETRY_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectToFirestoreEmulator(appName: string): Promise<void> {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId: EMULATOR_PROJECT_ID }, appName);
  // The client SDK's default gRPC transport multiplexes every read (even a
  // one-shot `getDocs()`) as a "target" on one shared `Listen` stream per
  // Firestore instance. With 40+ of these emulator test files — each
  // issuing many reads across many concurrently-running files against one
  // shared emulator — accumulated/replayed target state on that stream grew
  // without bound over a run (observed climbing from hundreds of MB to
  // multiple GB), eventually tripping gRPC's 4MB `RESOURCE_EXHAUSTED` limit
  // and failing whichever test happened to be watching at the time.
  // `experimentalForceLongPolling` switches the transport to plain HTTP
  // long-polling (one request per read, nothing multiplexed/accumulated) —
  // the SDK's own `FirestoreSettings` docs point network-reliability
  // workarounds like this one at
  // https://github.com/firebase/firebase-js-sdk/issues/1674.
  const firestore = initializeFirestore(app, { experimentalForceLongPolling: true });
  connectFirestoreEmulator(firestore, EMULATOR_HOST, EMULATOR_PORT);
  await FirestoreOrmRepository.initGlobalConnection(firestore);

  // The emulator's gRPC listener can still be settling for a moment right
  // after `firebase emulators:exec` reports it started, which intermittently
  // surfaces as a bogus RESOURCE_EXHAUSTED error on the client SDK's first
  // request. Retry a trivial read here so that transient failure lands
  // during setup instead of randomly failing whichever test runs first.
  for (let attempt = 1; attempt <= WARMUP_ATTEMPTS; attempt++) {
    try {
      await getDocs(collection(firestore, 'connection_warmup_probe'));
      return;
    } catch (error) {
      if (attempt === WARMUP_ATTEMPTS) throw error;
      await delay(WARMUP_RETRY_DELAY_MS);
    }
  }
}
