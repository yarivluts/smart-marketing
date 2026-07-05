import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import { AuthProvider, useAuth } from './auth-context';

const { onAuthStateChangedMock, createUserMock, signInMock, signInWithPopupMock, signOutMock } = vi.hoisted(() => ({
  onAuthStateChangedMock: vi.fn(),
  createUserMock: vi.fn(),
  signInMock: vi.fn(),
  signInWithPopupMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('@/lib/firebase/client', () => ({
  getFirebaseAuth: () => ({ __fakeAuth: true }),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: onAuthStateChangedMock,
  createUserWithEmailAndPassword: createUserMock,
  signInWithEmailAndPassword: signInMock,
  signInWithPopup: signInWithPopupMock,
  signOut: signOutMock,
  GoogleAuthProvider: class GoogleAuthProvider {},
}));

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'uid-1',
    email: 'person@example.com',
    getIdToken: vi.fn().mockResolvedValue('fake-id-token'),
    ...overrides,
  } as unknown as User;
}

function Probe(): React.ReactElement {
  const { user, loading, signUpWithEmail, signInWithEmail, signInWithGoogle, signOut } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <button onClick={() => void signUpWithEmail('a@b.com', 'password123')}>sign-up</button>
      <button onClick={() => void signInWithEmail('a@b.com', 'password123')}>sign-in</button>
      <button onClick={() => void signInWithGoogle()}>google</button>
      <button onClick={() => void signOut()}>sign-out</button>
    </div>
  );
}

describe('AuthProvider / useAuth', () => {
  let authStateCallback: (user: User | null) => void;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    onAuthStateChangedMock.mockImplementation((_auth, callback: (user: User | null) => void) => {
      authStateCallback = callback;
      callback(null);
      return vi.fn();
    });
    createUserMock.mockReset();
    signInMock.mockReset();
    signInWithPopupMock.mockReset();
    signOutMock.mockReset();
  });

  it('starts loading, then resolves to signed-out once the listener fires', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('reflects the signed-in user once the auth-state listener reports one', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    authStateCallback(fakeUser());
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('person@example.com'));
  });

  it('syncs the session cookie via POST on email sign-up', async () => {
    createUserMock.mockResolvedValue({ user: fakeUser() });
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await user.click(screen.getByText('sign-up'));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/auth/session',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ idToken: 'fake-id-token' }) }),
      ),
    );
  });

  it('syncs the session cookie via POST on email sign-in', async () => {
    signInMock.mockResolvedValue({ user: fakeUser() });
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await user.click(screen.getByText('sign-in'));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ method: 'POST' })),
    );
  });

  it('syncs the session cookie for a Google-federated sign-in', async () => {
    signInWithPopupMock.mockResolvedValue({ user: fakeUser({ email: 'person@gmail.com' }) });
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await user.click(screen.getByText('google'));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ method: 'POST' })),
    );
  });

  it('clears the session cookie via DELETE on sign-out', async () => {
    signOutMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await user.click(screen.getByText('sign-out'));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ method: 'DELETE' })),
    );
  });

  it('throws when useAuth is called outside an AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useAuth must be used within an AuthProvider');
    consoleError.mockRestore();
  });
});
