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

  it('connects via the emulator client SDK when FIRESTORE_EMULATOR_HOST is set (test/CI posture)', async () => {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8100';
    process.env.FIREBASE_PROJECT_ID = 'demo-growthos-test';

    await connectFirestoreOrmForApi();

    expect(connectFirestoreOrmMock).toHaveBeenCalledWith({ projectId: 'demo-growthos-test', emulatorHost: '127.0.0.1:8100' });
    expect(connectFirestoreOrmAdminMock).not.toHaveBeenCalled();
  });

  it('connects via the Admin SDK when no emulator host is set (real deployment posture)', async () => {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    process.env.FIREBASE_PROJECT_ID = 'growthos-g2w84';

    await connectFirestoreOrmForApi();

    expect(connectFirestoreOrmAdminMock).toHaveBeenCalledWith({ projectId: 'growthos-g2w84' });
    expect(connectFirestoreOrmMock).not.toHaveBeenCalled();
  });
});
