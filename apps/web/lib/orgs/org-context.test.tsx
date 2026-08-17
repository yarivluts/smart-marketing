import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OrgProvider, useOrgContext } from './org-context';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

function Probe(): React.ReactElement {
  const { loading, memberships } = useOrgContext();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="count">{memberships.length}</span>
    </div>
  );
}

function renderProvider(): void {
  render(
    <OrgProvider>
      <Probe />
    </OrgProvider>,
  );
}

describe('OrgProvider', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ userId: 'user-1', memberships: [{ membershipId: 'm1' }], bindings: [] }),
      }),
    );
  });

  it('does not fetch org context while the client auth state is still loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, sessionSyncing: false });
    renderProvider();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fetch org context while a session cookie sync is still in flight, even once loading is false', () => {
    // The regression this guards: `onAuthStateChanged` settles `loading` before
    // `establishSessionOrRollBack`'s cookie POST resolves — see
    // `AuthContextValue.sessionSyncing`'s own doc comment. Fetching in that
    // window returns an unauthenticated-looking empty result that then never
    // gets refetched (found via session-B dogfooding QA, 2026-08-17).
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, loading: false, sessionSyncing: true });
    renderProvider();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches org context once both loading and sessionSyncing settle', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, loading: false, sessionSyncing: false });
    renderProvider();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/orgs/context'));
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
  });

  it('clears data without fetching once signed out', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, sessionSyncing: false });
    renderProvider();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });
});
