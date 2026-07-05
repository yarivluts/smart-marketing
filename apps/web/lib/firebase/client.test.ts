import { beforeEach, describe, expect, it, vi } from 'vitest';

const { connectAuthEmulatorMock } = vi.hoisted(() => ({ connectAuthEmulatorMock: vi.fn() }));

vi.mock('firebase/auth', async () => {
  const actual = await vi.importActual<typeof import('firebase/auth')>('firebase/auth');
  return { ...actual, connectAuthEmulator: connectAuthEmulatorMock };
});

describe('getFirebaseAuth', () => {
  beforeEach(() => {
    vi.resetModules();
    connectAuthEmulatorMock.mockReset();
    vi.unstubAllEnvs();
  });

  it('memoizes a single Auth instance across calls', async () => {
    const { getFirebaseAuth } = await import('./client');
    expect(getFirebaseAuth()).toBe(getFirebaseAuth());
  });

  it('does not attempt to connect an emulator when the env var is unset', async () => {
    const { getFirebaseAuth } = await import('./client');
    getFirebaseAuth();
    expect(connectAuthEmulatorMock).not.toHaveBeenCalled();
  });

  it('connects to the Auth emulator exactly once when the env var is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
    const { getFirebaseAuth } = await import('./client');
    getFirebaseAuth();
    getFirebaseAuth();
    expect(connectAuthEmulatorMock).toHaveBeenCalledTimes(1);
    expect(connectAuthEmulatorMock).toHaveBeenCalledWith(expect.anything(), 'http://127.0.0.1:9099', {
      disableWarnings: true,
    });
  });
});
