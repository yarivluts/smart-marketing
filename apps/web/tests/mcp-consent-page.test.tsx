import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import McpConsentPage from '@/app/[locale]/oauth/mcp/consent/page';

// Mock dependencies
const mockGetServerSession = vi.fn();
const mockResolveOrgSessionContext = vi.fn();
const mockListOrgProjects = vi.fn();

vi.mock('@/lib/auth/get-server-session', () => ({
  getServerSession: () => mockGetServerSession(),
}));

vi.mock('@/lib/orgs/session-context', () => ({
  resolveOrgSessionContext: (...args: any[]) => mockResolveOrgSessionContext(...args),
}));

vi.mock('@/lib/orgs/queries', () => ({
  listOrgProjects: (...args: any[]) => mockListOrgProjects(...args),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ namespace }: { namespace?: string } = {}) => {
    return (key: string) => {
      const translations: Record<string, string> = {
        metaTitle: 'Connect an MCP client',
        heading: 'Connect an MCP client to GrowthOS',
        description: 'An MCP client is requesting read access to one of your projects.',
        invalidRequest: 'This authorization request is invalid, expired, or was already used.',
        noEligibleProjects: 'You don\'t have MCP read access to any project yet.',
        projectLabel: 'Project',
        approve: 'Approve',
        deny: 'Cancel',
        badge: 'OAuth 2.1 PKCE Authorization',
        clientLabel: 'Requesting Application',
        scopeDetailsTitle: 'Requested Capabilities',
        scopeMcpReadTitle: 'Analytics & Intelligence (mcp.read)',
        scopeMcpReadDetail: 'Query metrics catalog, retention cohorts, conversion funnels, and customer profiles.',
        scopeDashboardsWriteTitle: 'Goals & Segments (dashboards.write)',
        scopeDashboardsWriteDetail: 'Save conversion milestone goals and customer segment filter definitions.',
        securityTitle: 'Security & Privacy Guarantees',
        securityDetail: 'Access is strictly isolated to the selected project.',
        cancelWarning: 'Canceling will deny access and return you to the application.',
      };
      return translations[key] ?? key;
    };
  },
  setRequestLocale: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('McpConsentPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders invalid request error when missing client_id, redirect_uri, or code_challenge', async () => {
    const pageElement = await McpConsentPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(pageElement);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This authorization request is invalid, expired, or was already used.',
    );
  });

  it('renders consent UI with client branding, scopes, and target project selector', async () => {
    mockGetServerSession.mockResolvedValue({
      uid: 'usr_1',
      email: 'user@example.com',
    });

    mockResolveOrgSessionContext.mockResolvedValue({
      user: { id: 'usr_1' },
      memberships: [
        {
          organizationId: 'org_1',
          organizationName: 'Acme Growth',
          status: 'active',
        },
      ],
      bindings: [
        {
          principalType: 'user',
          principalId: 'usr_1',
          role: 'org_owner',
          scopeLevel: 'org',
          scopeId: 'org_1',
        },
      ],
    });

    mockListOrgProjects.mockResolvedValue([
      { id: 'proj_1', name: 'Main Storefront' },
    ]);

    const pageElement = await McpConsentPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        client_id: 'claude-desktop-oauth-app',
        redirect_uri: 'http://localhost:8000/callback',
        code_challenge: 'test_challenge_hash_123',
        code_challenge_method: 'S256',
        state: 'xyz_state',
        scope: 'mcp.read dashboards.write',
      }),
    });

    render(pageElement);

    // Verify requesting client branding
    expect(screen.getByText('Claude Desktop')).toBeInTheDocument();
    expect(screen.getByText('claude-desktop-oauth-app')).toBeInTheDocument();

    // Verify scopes and capabilities
    expect(screen.getByText('Analytics & Intelligence (mcp.read)')).toBeInTheDocument();
    expect(screen.getByText('Goals & Segments (dashboards.write)')).toBeInTheDocument();
    expect(screen.getByText('Security & Privacy Guarantees')).toBeInTheDocument();

    // Verify project target selector
    expect(screen.getByLabelText(/Project/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('org_1:proj_1');

    // Verify action buttons
    expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });
});
