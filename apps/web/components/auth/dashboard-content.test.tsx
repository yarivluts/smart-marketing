import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

function renderDashboard(props?: React.ComponentProps<typeof DashboardContent>): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DashboardContent {...props} />
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

  /* ---------------- R1: Executive KPI & Health Telemetry Grid ---------------- */
  it('renders R1 executive KPI and health telemetry grid with pulse and latency badges', () => {
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
      ],
    });
    renderDashboard({
      telemetryMetrics: {
        ingestUptime: '99.98%',
        ingestLatency: '<18ms',
        connectedPipelinesCount: 3,
        totalPipelinesCount: 3,
      },
    });

    const kpiSection = screen.getByLabelText('Key Health Indicators');
    expect(kpiSection).toBeInTheDocument();

    // 4 StatCards
    expect(screen.getByText('Active Workspaces')).toBeInTheDocument();
    expect(screen.getByText('Ingestion Health')).toBeInTheDocument();
    expect(screen.getByText('Pipelines & Connectors')).toBeInTheDocument();
    expect(screen.getByText('Pending Invitations')).toBeInTheDocument();

    // Uptime & Latency
    expect(screen.getByText('99.98%')).toBeInTheDocument();
    expect(screen.getByText('<18ms')).toBeInTheDocument();
    expect(screen.getByText('All Pipelines Synced')).toBeInTheDocument();
  });

  it('renders honest empty states when telemetry metrics are absent', () => {
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
      ],
    });
    renderDashboard();

    expect(screen.getByText('No stream activity')).toBeInTheDocument();
    expect(screen.getByText('None connected')).toBeInTheDocument();
  });

  /* ---------------- R2: Interactive Workspace Launchpads & Setup Readiness ---------------- */
  it('renders R2 workspace launchpad with structured profiles, readiness meter and 1-click launch', () => {
    mockUseOrgContext.mockReturnValue({
      loading: false,
      memberships: [
        {
          membershipId: 'm1',
          organizationId: 'org-1',
          organizationName: 'Acme Enterprise',
          role: 'owner',
          status: 'active',
        },
      ],
    });
    renderDashboard();

    // Profile tags
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('SaaS Subscription')).toBeInTheDocument();
    expect(screen.getByText('Stripe')).toBeInTheDocument();

    // Readiness meter: 3 of 4 Ready (75%)
    expect(screen.getByText('Setup Readiness')).toBeInTheDocument();
    expect(screen.getByText('3 of 4 Ready (75%)')).toBeInTheDocument();

    // 1-Click Launchpad button
    const launchBtn = screen.getByRole('link', { name: 'Launch Pulse' });
    expect(launchBtn).toHaveAttribute('href', '/orgs/org-1/projects/proj-1');
  });

  it('supports R2 client-side real-time workspace search and status filtering', () => {
    mockUseOrgContext.mockReturnValue({
      loading: false,
      memberships: [
        {
          membershipId: 'm1',
          organizationId: 'org-1',
          organizationName: 'Acme Corp',
          role: 'owner',
          status: 'active',
        },
        {
          membershipId: 'm2',
          organizationId: 'org-2',
          organizationName: 'Beta Analytics',
          role: 'member',
          status: 'active',
        },
      ],
    });
    renderDashboard();

    expect(screen.getByRole('link', { name: 'Acme Corp' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta Analytics' })).toBeInTheDocument();

    // Search for "Beta"
    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');
    fireEvent.change(searchInput, { target: { value: 'Beta' } });

    expect(screen.queryByRole('link', { name: 'Acme Corp' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta Analytics' })).toBeInTheDocument();

    // Search for non-existent workspace
    fireEvent.change(searchInput, { target: { value: 'NonExistent' } });
    expect(screen.getByText('No matching workspaces found.')).toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByRole('button', { name: 'Clear search' });
    fireEvent.click(clearBtn);

    expect(screen.getByRole('link', { name: 'Acme Corp' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta Analytics' })).toBeInTheDocument();
  });

  /* ---------------- R3: Live Operational Activity Feed ---------------- */
  it('controls R3 operational activity ticker with pause, resume, and category filtering', () => {
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
      ],
    });
    renderDashboard();

    const activityFeed = screen.getByLabelText('Operational Activity Feed');
    expect(activityFeed).toBeInTheDocument();

    // Initial state: Live Stream
    expect(screen.getByText('Live Stream')).toBeInTheDocument();
    const pauseBtn = screen.getByRole('button', { name: /Pause Stream/ });
    expect(pauseBtn).toBeInTheDocument();

    // Toggle Pause
    fireEvent.click(pauseBtn);
    expect(screen.getByText('Stream Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resume Stream/ })).toBeInTheDocument();

    // Toggle Resume
    fireEvent.click(screen.getByRole('button', { name: /Resume Stream/ }));
    expect(screen.getByText('Live Stream')).toBeInTheDocument();

    // Category Filter: Touchpoints
    const touchpointsTab = screen.getByRole('button', { name: /Touchpoints/ });
    fireEvent.click(touchpointsTab);
    expect(screen.getByText('High-Intent Ad Click (Google Search)')).toBeInTheDocument();
    // Conversions should not be in the filtered list
    expect(screen.queryByText('Enterprise Plan Checkout')).not.toBeInTheDocument();

    // Category Filter: Guardrails
    const guardrailsTab = screen.getByRole('button', { name: /Autonomous Guardrails/ });
    fireEvent.click(guardrailsTab);
    expect(screen.getByText('CPA Ceiling Guardrail Triggered')).toBeInTheDocument();
  });

  /* ---------------- R4: Quick-Action Cockpit ---------------- */
  it('renders R4 quick-action cockpit with 6 glassmorphic action cards and genuine project routes', () => {
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
      ],
    });
    renderDashboard();

    const cockpit = screen.getByLabelText('Quick-Action Cockpit');
    expect(cockpit).toBeInTheDocument();

    const adsAction = screen.getByRole('link', { name: /Ads & ROAS Cockpit/ });
    expect(adsAction).toHaveAttribute('href', '/orgs/org-1/projects/proj-1/campaigns');
    expect(adsAction.className).toContain('min-h-[56px]');

    const funnelAction = screen.getByRole('link', { name: /Conversion Funnels/ });
    expect(funnelAction).toHaveAttribute('href', '/orgs/org-1/projects/proj-1/funnel');

    const cohortsAction = screen.getByRole('link', { name: /Cohort Retention/ });
    expect(cohortsAction).toHaveAttribute('href', '/orgs/org-1/projects/proj-1/cohorts');

    const integrationsAction = screen.getByRole('link', { name: /Integrations Hub/ });
    expect(integrationsAction).toHaveAttribute('href', '/orgs/org-1/projects/proj-1/integrations');

    const streamHealthAction = screen.getByRole('link', { name: /Stream Ingest Health/ });
    expect(streamHealthAction).toHaveAttribute('href', '/orgs/org-1/projects/proj-1/billing-ops-feed');

    const copilotAction = screen.getByRole('link', { name: /AI Copilot & Actions/ });
    expect(copilotAction).toHaveAttribute('href', '/orgs/org-1/projects/proj-1/cost-guardrails');
  });

  it('gracefully falls back quick cockpit routes when user has no organization or project', () => {
    mockUseOrgContext.mockReturnValue({
      loading: false,
      memberships: [],
    });
    renderDashboard();

    const adsAction = screen.getByRole('link', { name: /Ads & ROAS Cockpit/ });
    expect(adsAction).toHaveAttribute('href', '/orgs');

    const funnelAction = screen.getByRole('link', { name: /Conversion Funnels/ });
    expect(funnelAction).toHaveAttribute('href', '/orgs');
  });
});
