import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { McpHub } from './mcp-hub';
import type { McpOAuthGrantSummary } from '@growthos/firebase-orm-models';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('McpHub Component', () => {
  const sampleGrants: McpOAuthGrantSummary[] = [
    {
      id: 'grant_1',
      clientId: 'claude-desktop-oauth',
      grantedByUserId: 'usr_1',
      scope: 'mcp.read dashboards.write',
      createdAt: '2026-09-01T10:00:00Z',
      lastUsedAt: '2026-09-04T12:00:00Z',
      revokedDueToTokenReuse: false,
      isActive: true,
    },
    {
      id: 'grant_2',
      clientId: 'cursor-mcp-agent',
      grantedByUserId: 'usr_1',
      scope: 'mcp.read',
      createdAt: '2026-08-15T09:00:00Z',
      revokedAt: '2026-08-20T11:00:00Z',
      revokedDueToTokenReuse: false,
      isActive: false,
    },
  ];

  it('renders endpoint URL and client setup tabs', () => {
    renderWithIntl(
      <McpHub
        orgId="org_1"
        projectId="prj_1"
        projectName="Demo SaaS"
        mcpUrl="https://api.growthos.io/v1/mcp"
        grants={sampleGrants}
      />,
      { locale: 'en' },
    );

    expect(screen.getByText('Model Context Protocol (MCP) Hub')).toBeInTheDocument();
    expect(screen.getByText('https://api.growthos.io/v1/mcp')).toBeInTheDocument();
    expect(screen.getByText('Claude Desktop')).toBeInTheDocument();
    expect(screen.getByText('Cursor IDE')).toBeInTheDocument();
    expect(screen.getByText('Antigravity & Gemini')).toBeInTheDocument();
    expect(screen.getByText('Headless & SDK')).toBeInTheDocument();
    expect(screen.getByText('Live Handshake Tester')).toBeInTheDocument();
  });

  it('switches tabs and displays Cursor configuration instructions', () => {
    renderWithIntl(
      <McpHub
        orgId="org_1"
        projectId="prj_1"
        projectName="Demo SaaS"
        mcpUrl="https://api.growthos.io/v1/mcp"
        grants={sampleGrants}
      />,
      { locale: 'en' },
    );

    const cursorTab = screen.getByTestId('tab-cursor');
    fireEvent.click(cursorTab);

    expect(screen.getByText(/Connect Cursor IDE/i)).toBeInTheDocument();
    expect(screen.getByText(/\.cursor\/mcp\.json/i)).toBeInTheDocument();
  });

  it('allows searching and filtering tools in the Tool Catalog tab', () => {
    renderWithIntl(
      <McpHub
        orgId="org_1"
        projectId="prj_1"
        projectName="Demo SaaS"
        mcpUrl="https://api.growthos.io/v1/mcp"
        grants={sampleGrants}
      />,
      { locale: 'en' },
    );

    // Switch to tools tab
    const toolsTab = screen.getByTestId('tab-tools');
    fireEvent.click(toolsTab);

    expect(screen.getByText('list_metrics')).toBeInTheDocument();
    expect(screen.getByText('query_cohort')).toBeInTheDocument();
    expect(screen.getByText('propose_action')).toBeInTheDocument();

    // Filter by category: Actions
    const actionsFilter = screen.getByRole('button', { name: /Actions & Automation/i });
    fireEvent.click(actionsFilter);

    expect(screen.getByText('propose_action')).toBeInTheDocument();
    expect(screen.getByText('approve_action')).toBeInTheDocument();
    expect(screen.queryByText('list_metrics')).not.toBeInTheDocument();

    // Filter by category: Setup & Integration
    const setupFilter = screen.getByRole('button', { name: /Setup & Integration/i });
    fireEvent.click(setupFilter);

    expect(screen.getByText('list_projects')).toBeInTheDocument();
    expect(screen.getByText('audit_installation_gaps')).toBeInTheDocument();
    expect(screen.getByText('get_tracking_script')).toBeInTheDocument();
    expect(screen.queryByText('propose_action')).not.toBeInTheDocument();

    // Search for goal
    const searchInput = screen.getByPlaceholderText(/Search tools by name/i);
    fireEvent.change(searchInput, { target: { value: 'delete_goal' } });

    expect(screen.getByText('delete_goal')).toBeInTheDocument();
    expect(screen.queryByText('list_projects')).not.toBeInTheDocument();
  });

  it('renders active grants and allows viewing revoked status', () => {
    renderWithIntl(
      <McpHub
        orgId="org_1"
        projectId="prj_1"
        projectName="Demo SaaS"
        mcpUrl="https://api.growthos.io/v1/mcp"
        grants={sampleGrants}
      />,
      { locale: 'en' },
    );

    // Switch to grants tab
    const grantsTab = screen.getByTestId('tab-grants');
    fireEvent.click(grantsTab);

    expect(screen.getByText('claude-desktop-oauth')).toBeInTheDocument();
    expect(screen.getByText('cursor-mcp-agent')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Revoked')).toBeInTheDocument();
  });

  it('renders seamlessly in Hebrew RTL locale', () => {
    renderWithIntl(
      <McpHub
        orgId="org_1"
        projectId="prj_1"
        projectName="Demo SaaS"
        mcpUrl="https://api.growthos.io/v1/mcp"
        grants={[]}
      />,
      { locale: 'he' },
    );

    expect(screen.getByText('מרכז פרוטוקול הקשר למודלים (MCP)')).toBeInTheDocument();
    expect(screen.getByText('סביבת Cursor')).toBeInTheDocument();
  });
});
