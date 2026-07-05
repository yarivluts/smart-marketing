import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { FirestoreOrmRepository } from '@arbel/firebase-orm';

/**
 * Connects the ORM's global Firestore connection to the local emulator
 * started by `firebase emulators:exec` (see this package's `test` script and
 * `firebase.json`). Must match the `--project` flag passed to that command.
 */
const EMULATOR_PROJECT_ID = 'demo-growthos-test';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8080;

export async function connectToFirestoreEmulator(appName: string): Promise<void> {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId: EMULATOR_PROJECT_ID }, appName);
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, EMULATOR_HOST, EMULATOR_PORT);
  await FirestoreOrmRepository.initGlobalConnection(firestore);
}
