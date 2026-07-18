import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DashboardContent } from './dashboard-content';
import messages from '../../messages/en.json';

const replace = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseOrgContext = vi.fn();
vi.mock('@/lib/orgs/org-context', () => ({
  useOrgContext: () => mockUseOrgContext(),
}));

function renderDashboard(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DashboardContent />
    </NextIntlClientProvider>,
  );
}

const signedInAuth = {
  user: { email: 'ada@example.com' },
  loading: false,
  signOut: vi.fn(),
};

describe('DashboardContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(signedInAuth);
  });

  it('renders nothing while the client auth state has no user', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true, signOut: vi.fn() });
    mockUseOrgContext.mockReturnValue({ memberships: [], loading: true });
    renderDashboard();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('links each active organization to its org page', () => {
    mockUseOrgContext.mockReturnValue({
      loading: false,
      memberships: [
        {
          membershipId: 'm1',
          organizationId: 'org-1',
          organizationName: 'Acme',
          role: 'owner',
          status: 'active',
        },
        {
          membershipId: 'm2',
          organizationId: 'org-2',
          organizationName: 'Globex',
          role: 'viewer',
          status: 'invited',
        },
      ],
    });
    renderDashboard();

    const acmeLink = screen.getByRole('link', { name: /Acme/ });
    expect(acmeLink).toHaveAttribute('href', '/orgs/org-1');
    // invited memberships are not listed as active orgs...
    expect(screen.queryByRole('link', { name: /Globex/ })).not.toBeInTheDocument();
    // ...but do surface as a pending-invites link to /orgs.
    expect(screen.getByRole('link', { name: /pending invite/ })).toHaveAttribute('href', '/orgs');
  });

  it('shows a create-organization call to action when there are no orgs', () => {
    mockUseOrgContext.mockReturnValue({ loading: false, memberships: [] });
    renderDashboard();

    expect(screen.getByText(/not a member of any organization/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first organization' })).toHaveAttribute(
      'href',
      '/orgs/new',
    );
  });

  it('always offers the all-organizations link', () => {
    mockUseOrgContext.mockReturnValue({ loading: false, memberships: [] });
    renderDashboard();
    expect(screen.getByRole('link', { name: 'View all organizations' })).toHaveAttribute(
      'href',
      '/orgs',
    );
  });
});
