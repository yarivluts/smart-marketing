import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DashboardContent } from './dashboard-content';
import messages from '../../messages/en.json';
import { summarizeProjectHealth } from '@/lib/orgs/workspace-view';
import type { DashboardOverview } from '@/lib/orgs/dashboard-overview';

const replace = vi.fn();
const push = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace, push }),
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

const NOW = Date.parse('2026-09-20T12:00:00.000Z');

function renderDashboard(overview: DashboardOverview): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DashboardContent email="ada@example.com" overview={overview} now={NOW} />
    </NextIntlClientProvider>,
  );
}

const signOut = vi.fn().mockResolvedValue(undefined);

const healthyOverview: DashboardOverview = {
  pendingInviteCount: 1,
  orgs: [
    {
      orgId: 'org-1',
      name: 'Acme',
      role: 'org_owner',
      hiddenProjectCount: 0,
      projects: [
        {
          orgId: 'org-1',
          projectId: 'p-1',
          name: 'Growth',
          vertical: 'SaaS',
          onboardingStep: 'funnel',
          health: summarizeProjectHealth(
            {
              environments: [
                {
                  environmentId: 'e-prod',
                  environmentName: 'prod',
                  requirements: [
                    { requirementId: 'signups', status: 'connected', acceptedSchemas: [], rejectedSchemas: [], silentRegisteredSchemas: [], quarantineReasons: [], lastAcceptedAt: null },
                    { requirementId: 'billing', status: 'gap', acceptedSchemas: [], rejectedSchemas: [], silentRegisteredSchemas: [], quarantineReasons: [], lastAcceptedAt: null },
                  ],
                  connectedCount: 1,
                  totalCount: 2,
                  coreConnectedCount: 1,
                  coreTotalCount: 2,
                  score: 50,
                },
              ],
            },
            [
              { created_at: '2026-09-20T11:00:00.000Z', accepted_count: 40, quarantined_count: 2 },
              { created_at: '2026-09-19T11:00:00.000Z', accepted_count: 60, quarantined_count: 0 },
            ],
            NOW,
          ),
        },
        { orgId: 'org-1', projectId: 'p-2', name: 'Viewer Only', vertical: null, health: null },
      ],
    },
  ],
};

describe('DashboardContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { email: 'ada@example.com' }, loading: false, signOut });
  });

  it('opens on the workspace KPIs computed from the projects it was given', () => {
    renderDashboard(healthyOverview);
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Welcome back, ada@example.com')).toBeInTheDocument();
    // One project with a readable score of 50 -> average 50%; 100 records accepted over the window.
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
    const hero = screen.getByTestId('page-hero');
    expect(within(hero).getByText('100')).toBeInTheDocument();
    // Core streams are incomplete, so the one readable project is not "fully flowing".
    expect(within(hero).getByText('0/1')).toBeInTheDocument();
    expect(screen.getByText('2 records rejected in the same window')).toBeInTheDocument();
  });

  it('links each org to its page and renders a health card per project', () => {
    renderDashboard(healthyOverview);
    expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/orgs/org-1');

    const card = screen.getByTestId('project-card-p-1');
    expect(within(card).getByText('Growth')).toBeInTheDocument();
    expect(within(card).getByText('1/2 streams')).toBeInTheDocument();
    expect(within(card).getByText('Setup 2 of 4 steps done')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Open project/ })).toHaveAttribute('href', '/orgs/org-1/projects/p-1/campaigns');
    expect(within(card).getByRole('link', { name: /Continue setup/ })).toHaveAttribute('href', '/orgs/org-1/projects/p-1/onboarding');

    // A project whose health the viewer cannot read says so rather than showing zeros.
    const restricted = screen.getByTestId('project-card-p-2');
    expect(within(restricted).getByText('Ingest health is visible to project admins.')).toBeInTheDocument();
    expect(within(restricted).queryByRole('link', { name: /Data health/ })).not.toBeInTheDocument();
  });

  it('surfaces pending invites and always offers the all-organizations link', () => {
    renderDashboard(healthyOverview);
    expect(screen.getByRole('link', { name: /pending invite/ })).toHaveAttribute('href', '/orgs');
    expect(screen.getByRole('link', { name: 'View all organizations' })).toHaveAttribute('href', '/orgs');
  });

  it('shows a create-organization call to action when there are no orgs', () => {
    renderDashboard({ orgs: [], pendingInviteCount: 0 });
    expect(screen.getByText(/not a member of any organization/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first organization' })).toHaveAttribute('href', '/orgs/new');
    expect(screen.queryByRole('link', { name: /pending invite/ })).not.toBeInTheDocument();
  });

  it('signs out and returns to the login page', async () => {
    renderDashboard({ orgs: [], pendingInviteCount: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(signOut).toHaveBeenCalled();
  });

  it('sends a client whose Firebase session is gone back to login', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false, signOut });
    renderDashboard({ orgs: [], pendingInviteCount: 0 });
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
