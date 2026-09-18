const connectFirestoreOrmMock = jest.fn().mockResolvedValue(undefined);
const connectFirestoreOrmAdminMock = jest.fn().mockResolvedValue(undefined);

jest.mock('@growthos/firebase-orm-models', () => ({
  connectFirestoreOrm: (...args: unknown[]) => connectFirestoreOrmMock(...args),
  connectFirestoreOrmAdmin: (...args: unknown[]) => connectFirestoreOrmAdminMock(...args),
}));

import { connectFirestoreOrmForApi } from './firestore-orm.bootstrap';

describe('connectFirestoreOrmForApi', () => {
  const originalEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const originalProjectId = process.env.FIREBASE_PROJECT_ID;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalEmulatorHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = originalEmulatorHost;
    if (originalProjectId === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = originalProjectId;
  });

  it('uses the Admin SDK against the emulator too, never the client SDK (KAN-128)', async () => {
    // This assertion is inverted from what it used to be, deliberately. It
    // previously pinned the client-SDK-against-emulator branch, which is the
    // branch that kept failing CI with KAN-103's corrupted-stream signature -
    // including on documentation-only pull requests. The Admin SDK reads
    // FIRESTORE_EMULATOR_HOST from the environment itself, so the emulator needs
    // no separate call.
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8100';
    process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';

    await connectFirestoreOrmForApi();

    expect(connectFirestoreOrmAdminMock).toHaveBeenCalledWith({ projectId: 'demo-growthos-test' });
    expect(connectFirestoreOrmMock).not.toHaveBeenCalled();
  });

  it('connects via the Admin SDK when no emulator host is set (real deployment posture - now the same path)', async () => {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.FIREBASE_PROJECT_ID = 'growthos-g2w84';

    await connectFirestoreOrmForApi();

    expect(connectFirestoreOrmAdminMock).toHaveBeenCalledWith({ projectId: 'growthos-g2w84' });
    expect(connectFirestoreOrmMock).not.toHaveBeenCalled();
  });
});
