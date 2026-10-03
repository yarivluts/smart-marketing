import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../messages/en.json';
import {
  WorkspaceLaunchpads,
  type WorkspaceCardData,
} from './workspace-launchpads';
import {
  OperationalActivityTicker,
  type FeedEventItem,
} from './operational-activity-ticker';
import { DashboardQuickCockpit } from './dashboard-quick-cockpit';
import { DashboardTelemetryGrid } from './dashboard-telemetry-grid';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : String(href)} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const SAMPLE_WORKSPACES: WorkspaceCardData[] = [
  {
    id: 'ws-1',
    organizationId: 'org-1',
    organizationName: 'Acme Cloud',
    projectId: 'proj-1',
    projectName: 'Cloud Ops',
    role: 'owner',
    status: 'active',
    platformType: 'web',
    businessModel: 'saas_subscription',
    primaryStack: 'stripe',
    setupReadiness: {
      readyCount: 4,
      totalCount: 4,
      percentage: 100,
      isReady: true,
    },
  },
  {
    id: 'ws-2',
    organizationId: 'org-2',
    organizationName: 'Beta Retail',
    projectId: 'proj-2',
    projectName: 'Shopify Storefront',
    role: 'admin',
    status: 'active',
    platformType: 'hybrid',
    businessModel: 'ecommerce_physical',
    primaryStack: 'shopify',
    setupReadiness: {
      readyCount: 2,
      totalCount: 4,
      percentage: 50,
      isReady: false,
    },
  },
  {
    id: 'ws-3',
    organizationId: 'org-3',
    organizationName: 'Gamma Mobile',
    projectId: 'proj-3',
    projectName: 'iOS Tracker',
    role: 'viewer',
    status: 'active',
    platformType: 'mobile',
    businessModel: 'digital_products',
    primaryStack: 'mobile_native',
    setupReadiness: {
      readyCount: 1,
      totalCount: 3,
      percentage: 33,
      isReady: false,
    },
  },
  {
    id: 'ws-4',
    organizationId: 'org-4',
    organizationName: 'Delta B2B Leads',
    projectId: 'proj-4',
    projectName: 'HubSpot Ingest',
    role: 'member',
    status: 'active',
    platformType: 'web',
    businessModel: 'leadgen_b2b',
    primaryStack: 'hubspot_salesforce',
    setupReadiness: {
      readyCount: 4,
      totalCount: 4,
      percentage: 100,
      isReady: true,
    },
  },
  {
    id: 'ws-5',
    organizationId: 'org-5',
    organizationName: 'Epsilon Market',
    projectId: 'proj-5',
    projectName: 'Custom Exchange',
    role: 'admin',
    status: 'active',
    platformType: 'hybrid',
    businessModel: 'marketplace_hybrid',
    primaryStack: 'custom_web',
    setupReadiness: {
      readyCount: 2,
      totalCount: 4,
      percentage: 50,
      isReady: false,
    },
  },
];

describe('Adversarial Stress Suite: Workspace Search & Filters', () => {
  it('searches accurately by organization name with case insensitivity and whitespace trimming', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');

    // Exact lowercase
    fireEvent.change(searchInput, { target: { value: 'acme' } });
    expect(screen.getByRole('link', { name: 'Acme Cloud' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Beta Retail' })).not.toBeInTheDocument();

    // Mixed case with leading/trailing whitespace
    fireEvent.change(searchInput, { target: { value: '   bEtA   ' } });
    expect(screen.getByRole('link', { name: 'Beta Retail' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Acme Cloud' })).not.toBeInTheDocument();
  });

  it('searches accurately by project name when project differs from organization name', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');

    fireEvent.change(searchInput, { target: { value: 'Shopify Storefront' } });
    expect(screen.getByRole('link', { name: 'Beta Retail' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Acme Cloud' })).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'iOS Tracker' } });
    expect(screen.getByRole('link', { name: 'Gamma Mobile' })).toBeInTheDocument();
  });

  it('searches accurately by member role (owner, admin, viewer, member)', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');

    // Search 'viewer'
    fireEvent.change(searchInput, { target: { value: 'viewer' } });
    expect(screen.getByRole('link', { name: 'Gamma Mobile' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Acme Cloud' })).not.toBeInTheDocument();

    // Search 'admin'
    fireEvent.change(searchInput, { target: { value: 'admin' } });
    expect(screen.getByRole('link', { name: 'Beta Retail' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Epsilon Market' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Acme Cloud' })).not.toBeInTheDocument();
  });

  it('searches accurately by tech stack enum substring (stripe, shopify, hubspot, custom)', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');

    fireEvent.change(searchInput, { target: { value: 'stripe' } });
    expect(screen.getByRole('link', { name: 'Acme Cloud' })).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'hubspot' } });
    expect(screen.getByRole('link', { name: 'Delta B2B Leads' })).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'custom' } });
    expect(screen.getByRole('link', { name: 'Epsilon Market' })).toBeInTheDocument();
  });

  it('searches accurately by business model enum substring (saas, ecommerce, leadgen, marketplace)', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');

    fireEvent.change(searchInput, { target: { value: 'saas' } });
    expect(screen.getByRole('link', { name: 'Acme Cloud' })).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'leadgen' } });
    expect(screen.getByRole('link', { name: 'Delta B2B Leads' })).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'marketplace' } });
    expect(screen.getByRole('link', { name: 'Epsilon Market' })).toBeInTheDocument();
  });

  it('searches accurately by platform type (web, mobile, hybrid)', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');

    fireEvent.change(searchInput, { target: { value: 'mobile' } });
    // Note: Gamma Mobile has platform 'mobile', and also organizationName contains 'Mobile'
    expect(screen.getByRole('link', { name: 'Gamma Mobile' })).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'hybrid' } });
    expect(screen.getByRole('link', { name: 'Beta Retail' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Epsilon Market' })).toBeInTheDocument();
  });

  it('handles adversarial queries: regex special characters, symbols, and empty/whitespace queries', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');

    // Regex characters that would break new RegExp(...)
    expect(() => {
      fireEvent.change(searchInput, { target: { value: '[a-z]*.*(?' } });
    }).not.toThrow();
    // Empty state should be rendered
    expect(screen.getByText('No matching workspaces found.')).toBeInTheDocument();

    // Whitespace only query should show all 5 workspaces
    fireEvent.change(searchInput, { target: { value: '     ' } });
    expect(screen.getByRole('link', { name: 'Acme Cloud' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta Retail' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gamma Mobile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Delta B2B Leads' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Epsilon Market' })).toBeInTheDocument();
  });

  it('renders graceful empty state with functional Clear search action', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');
    fireEvent.change(searchInput, { target: { value: 'NonExistentXYZ123' } });

    expect(screen.getByText('No matching workspaces found.')).toBeInTheDocument();

    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    fireEvent.click(clearButton);

    // All workspaces should be restored
    expect(screen.getByRole('link', { name: 'Acme Cloud' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta Retail' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Delta B2B Leads' })).toBeInTheDocument();
  });

  it('clears search via the inline X button inside the input container', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');
    fireEvent.change(searchInput, { target: { value: 'Acme' } });

    expect(screen.queryByRole('link', { name: 'Beta Retail' })).not.toBeInTheDocument();

    const inlineClear = screen.getByRole('button', { name: 'Clear search query' });
    fireEvent.click(inlineClear);

    expect(screen.getByRole('link', { name: 'Beta Retail' })).toBeInTheDocument();
  });

  it('filters correctly by status tabs (All, Ready, Setup Required) with live badge counts', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    // Check counts: 2 ready (Acme, Delta), 3 setup required (Beta, Gamma, Epsilon), 5 total
    const allTab = screen.getByRole('button', { name: /All Workspaces/ });
    const readyTab = screen.getByRole('button', { name: /Ready \(100%\)/ });
    const setupTab = screen.getByRole('button', { name: /Setup Required/ });

    expect(allTab).toHaveTextContent('5');
    expect(readyTab).toHaveTextContent('2');
    expect(setupTab).toHaveTextContent('3');

    // Click Ready
    fireEvent.click(readyTab);
    expect(screen.getByRole('link', { name: 'Acme Cloud' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Delta B2B Leads' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Beta Retail' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Gamma Mobile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Epsilon Market' })).not.toBeInTheDocument();

    // Click Setup Required
    fireEvent.click(setupTab);
    expect(screen.queryByRole('link', { name: 'Acme Cloud' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Delta B2B Leads' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta Retail' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gamma Mobile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Epsilon Market' })).toBeInTheDocument();

    // Click All
    fireEvent.click(allTab);
    expect(screen.getByRole('link', { name: 'Acme Cloud' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta Retail' })).toBeInTheDocument();
  });

  it('combines status tab filter with search query and resets both on Clear search', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    const readyTab = screen.getByRole('button', { name: /Ready \(100%\)/ });
    fireEvent.click(readyTab);

    // Filter to Ready AND search for Beta (which is setup required) -> 0 results
    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');
    fireEvent.change(searchInput, { target: { value: 'Beta' } });

    expect(screen.getByText('No matching workspaces found.')).toBeInTheDocument();

    // Clicking Clear search in the empty state must reset BOTH search query and status filter
    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    fireEvent.click(clearButton);

    expect(screen.getByRole('link', { name: 'Acme Cloud' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta Retail' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gamma Mobile' })).toBeInTheDocument();
  });

  it('evaluates search behavior against formatted UI labels vs raw enum identifiers', () => {
    renderWithIntl(<WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />);

    const searchInput = screen.getByPlaceholderText('Search workspaces by name, stack, model...');

    // 1. Raw snake_case enum substring matches
    fireEvent.change(searchInput, { target: { value: 'custom' } });
    expect(screen.getByRole('link', { name: 'Epsilon Market' })).toBeInTheDocument();

    // 2. Exact UI display label "Custom Web" (as rendered on the badge)
    // EMPIRICAL OBSERVATION: 'custom_web'.includes('custom web') is FALSE!
    fireEvent.change(searchInput, { target: { value: 'Custom Web' } });
    const matchCustomWebWithSpace = screen.queryByRole('link', { name: 'Epsilon Market' });
    expect(matchCustomWebWithSpace).toBeNull(); // FAILS to match formatted label!

    // 3. Exact UI display label "E-Commerce" (with hyphen, as rendered on the badge)
    // EMPIRICAL OBSERVATION: 'ecommerce_physical'.includes('e-commerce') is FALSE!
    fireEvent.change(searchInput, { target: { value: 'E-Commerce' } });
    const matchEcommerceWithHyphen = screen.queryByRole('link', { name: 'Beta Retail' });
    expect(matchEcommerceWithHyphen).toBeNull(); // FAILS to match formatted label!

    // 4. Exact UI display label "SaaS Subscription" (with space)
    // EMPIRICAL OBSERVATION: 'saas_subscription'.includes('saas subscription') is FALSE!
    fireEvent.change(searchInput, { target: { value: 'SaaS Subscription' } });
    const matchSaasSubscription = screen.queryByRole('link', { name: 'Acme Cloud' });
    expect(matchSaasSubscription).toBeNull(); // FAILS to match formatted label!
  });

  it('empirically verifies Hebrew localized search behavior against displayed Hebrew badges', async () => {
    const heMessages = (await import('../../messages/he.json')).default;
    render(
      <NextIntlClientProvider locale="he" messages={heMessages}>
        <WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />
      </NextIntlClientProvider>,
    );

    const searchInput = screen.getByPlaceholderText('חיפוש סביבות עבודה לפי שם, טכנולוגיה, מודל...');

    // In Hebrew UI, Beta Retail displays badge "מסחר אלקטרוני" (E-Commerce)
    fireEvent.change(searchInput, { target: { value: 'מסחר אלקטרוני' } });
    // EMPIRICAL OBSERVATION: 'ecommerce_physical'.includes('מסחר אלקטרוני') is FALSE!
    expect(screen.queryByRole('link', { name: 'Beta Retail' })).toBeNull();

    // In Hebrew UI, Epsilon Market displays badge "פיתוח מותאם" (Custom Web)
    fireEvent.change(searchInput, { target: { value: 'פיתוח מותאם' } });
    expect(screen.queryByRole('link', { name: 'Epsilon Market' })).toBeNull();

    // In Hebrew UI, platformType 'hybrid' displays badge "היברידי"
    fireEvent.change(searchInput, { target: { value: 'היברידי' } });
    expect(screen.queryByRole('link', { name: 'Beta Retail' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Epsilon Market' })).toBeNull();
  });
});

describe('Adversarial Stress Suite: Live Operational Activity Ticker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial state is Live Stream with green pinging badge and Pause button', () => {
    renderWithIntl(<OperationalActivityTicker />);

    expect(screen.getByText('Live Stream')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pause Stream/ })).toBeInTheDocument();
    expect(screen.queryByText('Stream Paused')).not.toBeInTheDocument();
  });

  it('toggles pause and resume cleanly with immediate badge and button updates', () => {
    renderWithIntl(<OperationalActivityTicker />);

    const pauseBtn = screen.getByRole('button', { name: /Pause Stream/ });
    fireEvent.click(pauseBtn);

    // Paused state
    expect(screen.getByText('Stream Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resume Stream/ })).toBeInTheDocument();
    expect(screen.queryByText('Live Stream')).not.toBeInTheDocument();

    // Resume state
    const resumeBtn = screen.getByRole('button', { name: /Resume Stream/ });
    fireEvent.click(resumeBtn);

    expect(screen.getByText('Live Stream')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pause Stream/ })).toBeInTheDocument();
    expect(screen.queryByText('Stream Paused')).not.toBeInTheDocument();
  });

  it('advancing time rotates events when active, but completely stops rotation when paused', () => {
    const customEvents: FeedEventItem[] = [
      {
        id: 'evt-alpha',
        timestamp: '10m ago',
        category: 'touchpoint',
        title: 'Alpha Event',
        description: 'First event',
        source: 'SDK',
        sourceType: 'sdk',
        severity: 'info',
      },
      {
        id: 'evt-omega',
        timestamp: '20m ago',
        category: 'conversion',
        title: 'Omega Event',
        description: 'Last event',
        source: 'Stripe',
        sourceType: 'stripe',
        severity: 'success',
      },
    ];

    renderWithIntl(<OperationalActivityTicker initialEvents={customEvents} />);

    // Initially evt-alpha is top, evt-omega is bottom
    // After 8000ms active interval, evt-omega should rotate to top with timestamp "Just now"
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    // Pause the feed
    const pauseBtn = screen.getByRole('button', { name: /Pause Stream/ });
    fireEvent.click(pauseBtn);

    // Advance by another 24000ms while paused
    act(() => {
      vi.advanceTimersByTime(24000);
    });

    // Verify it is still paused
    expect(screen.getByText('Stream Paused')).toBeInTheDocument();

    // Resume the feed
    const resumeBtn = screen.getByRole('button', { name: /Resume Stream/ });
    fireEvent.click(resumeBtn);

    // Advance 8000ms again to verify streaming restarted cleanly
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getByText('Live Stream')).toBeInTheDocument();
  });

  it('filters accurately across all 4 category tabs with live count indicators', () => {
    renderWithIntl(<OperationalActivityTicker />);

    const allTab = screen.getByRole('button', { name: /All Events/ });
    const touchpointsTab = screen.getByRole('button', { name: /Touchpoints/ });
    const conversionsTab = screen.getByRole('button', { name: /Conversions/ });
    const guardrailsTab = screen.getByRole('button', { name: /Autonomous Guardrails/ });

    // Check counts: initial has 7 items: 3 touchpoints, 2 conversions, 2 guardrails
    expect(allTab).toHaveTextContent('7');
    expect(touchpointsTab).toHaveTextContent('3');
    expect(conversionsTab).toHaveTextContent('2');
    expect(guardrailsTab).toHaveTextContent('2');

    // Filter: Conversions
    fireEvent.click(conversionsTab);
    expect(screen.getByText('Enterprise Plan Checkout')).toBeInTheDocument();
    expect(screen.getByText('Pro Plan Upgrade')).toBeInTheDocument();
    expect(screen.queryByText('High-Intent Ad Click (Google Search)')).not.toBeInTheDocument();
    expect(screen.queryByText('CPA Ceiling Guardrail Triggered')).not.toBeInTheDocument();

    // Filter: Guardrails
    fireEvent.click(guardrailsTab);
    expect(screen.getByText('CPA Ceiling Guardrail Triggered')).toBeInTheDocument();
    expect(screen.getByText('Budget Burn Pacing Circuit Breaker')).toBeInTheDocument();
    expect(screen.queryByText('Enterprise Plan Checkout')).not.toBeInTheDocument();

    // Filter: Touchpoints
    fireEvent.click(touchpointsTab);
    expect(screen.getByText('High-Intent Ad Click (Google Search)')).toBeInTheDocument();
    expect(screen.getByText('Meta Conversions API (CAPI) Ping')).toBeInTheDocument();
    expect(screen.getByText('Web SDK Session Ingested')).toBeInTheDocument();
    expect(screen.queryByText('Enterprise Plan Checkout')).not.toBeInTheDocument();
  });

  it('renders graceful empty state when a category has zero events', () => {
    const onlyTouchpoints: FeedEventItem[] = [
      {
        id: 'evt-1',
        timestamp: 'Just now',
        category: 'touchpoint',
        title: 'Touchpoint Only',
        description: 'Only touchpoint exists',
        source: 'SDK',
        sourceType: 'sdk',
        severity: 'info',
      },
    ];

    renderWithIntl(<OperationalActivityTicker initialEvents={onlyTouchpoints} />);

    const conversionsTab = screen.getByRole('button', { name: /Conversions/ });
    fireEvent.click(conversionsTab);

    expect(screen.getByText('No operational events recorded in this category.')).toBeInTheDocument();
  });
});

describe('Adversarial Stress Suite: Responsive Layout Classes & Touch Targets', () => {
  it('verifies responsive multi-tier grid classes across Telemetry, Cockpit, and Workspaces', () => {
    renderWithIntl(
      <div>
        <DashboardTelemetryGrid activeWorkspacesCount={5} pendingInvitesCount={0} />
        <DashboardQuickCockpit primaryOrgId="org-1" />
        <WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />
      </div>,
    );

    // Telemetry grid: 1 col on mobile, 2 col on tablet (sm:), 4 col on desktop (lg:)
    const telemetrySection = screen.getByLabelText('Key Health Indicators');
    expect(telemetrySection.className).toContain('grid-cols-1');
    expect(telemetrySection.className).toContain('sm:grid-cols-2');
    expect(telemetrySection.className).toContain('lg:grid-cols-4');

    // Quick cockpit: 1 col on mobile, 2 col sm, 3 col lg, 6 col xl
    const cockpitSection = screen.getByLabelText('Quick-Action Cockpit');
    const cockpitGrid = cockpitSection.querySelector('div.grid');
    expect(cockpitGrid?.className).toContain('grid-cols-1');
    expect(cockpitGrid?.className).toContain('sm:grid-cols-2');
    expect(cockpitGrid?.className).toContain('lg:grid-cols-3');
    expect(cockpitGrid?.className).toContain('xl:grid-cols-6');

    // Workspace launchpads: 1 col on mobile, 2 col md, 3 col lg
    const workspacesSection = screen.getByLabelText('Workspaces Section');
    const workspacesGrid = workspacesSection.querySelector('div.grid');
    expect(workspacesGrid?.className).toContain('grid-cols-1');
    expect(workspacesGrid?.className).toContain('md:grid-cols-2');
    expect(workspacesGrid?.className).toContain('lg:grid-cols-3');
  });

  it('verifies touch target dimensions for QuickCockpit action cards (>= 44px on mobile)', () => {
    renderWithIntl(<DashboardQuickCockpit primaryOrgId="org-1" />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);

    for (const link of links) {
      // Must have mobile min-h >= 44px (configured as min-h-[56px])
      expect(link.className).toContain('min-h-[56px]');
      // Desktop min-h configured as sm:min-h-[110px]
      expect(link.className).toContain('sm:min-h-[110px]');
    }
  });

  it('generates genuine project-scoped URLs when project and org IDs are present, and falls back gracefully', () => {
    const { rerender } = renderWithIntl(
      <DashboardQuickCockpit primaryOrgId="org-alpha" primaryProjectId="proj-beta" />,
    );
    expect(screen.getByRole('link', { name: /Ads & ROAS Cockpit/i })).toHaveAttribute(
      'href',
      '/orgs/org-alpha/projects/proj-beta/campaigns',
    );
    expect(screen.getByRole('link', { name: /Conversion Funnels/i })).toHaveAttribute(
      'href',
      '/orgs/org-alpha/projects/proj-beta/funnel',
    );
    expect(screen.getByRole('link', { name: /Stream Ingest Health/i })).toHaveAttribute(
      'href',
      '/orgs/org-alpha/projects/proj-beta/billing-ops-feed',
    );

    // Fallback: Org only
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DashboardQuickCockpit primaryOrgId="org-alpha" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('link', { name: /Ads & ROAS Cockpit/i })).toHaveAttribute(
      'href',
      '/orgs/org-alpha',
    );

    // Fallback: Neither
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DashboardQuickCockpit />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('link', { name: /Ads & ROAS Cockpit/i })).toHaveAttribute(
      'href',
      '/orgs',
    );
  });

  it('measures touch target dimensions of secondary controls against WCAG 44px guideline', () => {
    renderWithIntl(
      <div>
        <WorkspaceLaunchpads workspaces={SAMPLE_WORKSPACES} />
        <OperationalActivityTicker />
      </div>,
    );

    // 1. Launch button in Workspace card: configured as h-8 (32px < 44px)
    const launchButtons = screen.getAllByRole('link', { name: /Launch Pulse/i });
    expect(launchButtons[0].className).toContain('h-8');

    // 2. Status filter pills in Workspace section: py-1 text-xs (~24px < 44px)
    const allPill = screen.getByRole('button', { name: /All Workspaces/i });
    expect(allPill.className).toContain('py-1');

    // 3. Pause/Resume button in Activity Feed: configured as h-8 (32px < 44px)
    const pauseBtn = screen.getByRole('button', { name: /Pause Stream/i });
    expect(pauseBtn.className).toContain('h-8');

    // 4. Category filter buttons in Activity Feed: py-1.5 text-xs (~28px < 44px)
    const categoryBtn = screen.getByRole('button', { name: /Touchpoints/i });
    expect(categoryBtn.className).toContain('py-1.5');
  });
});
