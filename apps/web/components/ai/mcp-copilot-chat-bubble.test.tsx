import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { McpCopilotChatBubble } from './mcp-copilot-chat-bubble';

const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
  usePathname: () => '/orgs/org-123/projects/proj-456/funnel',
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('McpCopilotChatBubble Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders docked floating trigger button when initially closed', () => {
    renderWithIntl(
      <McpCopilotChatBubble orgId="org-123" projectId="proj-456" initialOpen={false} />,
      { locale: 'en' },
    );

    const trigger = screen.getByTestId('copilot-bubble-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-label', 'GrowthOS AI Copilot (Cmd+J)');
    expect(screen.queryByTestId('copilot-chat-window')).not.toBeInTheDocument();
  });

  it('opens chat window when trigger button is clicked and shows header & welcome message', () => {
    renderWithIntl(
      <McpCopilotChatBubble orgId="org-123" projectId="proj-456" initialOpen={false} />,
      { locale: 'en' },
    );

    const trigger = screen.getByTestId('copilot-bubble-trigger');
    fireEvent.click(trigger);

    expect(screen.getByTestId('copilot-chat-window')).toBeInTheDocument();
    expect(screen.getByText('GrowthOS AI Copilot')).toBeInTheDocument();
    expect(screen.getByText('26 Tools Active')).toBeInTheDocument();
    expect(screen.getByTestId('copilot-chat-input')).toBeInTheDocument();
  });

  it('supports RTL layout in Hebrew', () => {
    renderWithIntl(
      <McpCopilotChatBubble orgId="org-123" projectId="proj-456" initialOpen={true} />,
      { locale: 'he' },
    );

    const root = screen.getByTestId('copilot-bubble-root');
    expect(root).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('סוכן ה-AI של GrowthOS')).toBeInTheDocument();
    expect(screen.getByText('26 כלים פעילים')).toBeInTheDocument();
  });

  it('sends user message and renders assistant response with collapsible MCP tool calls', async () => {
    const mockResponse = {
      message: {
        id: 'asst-1',
        role: 'assistant',
        content: 'I analyzed your funnel drop-offs using MCP.',
        timestamp: '12:30',
        toolCalls: [
          {
            tool: 'mcp.query_funnel',
            input: { projectId: 'proj-456', stages: ['visit', 'signup'] },
            resultPreview: '15.2% overall conversion',
            latencyMs: 42,
          },
        ],
        quickActions: [
          {
            label: 'Full Conversion Funnel →',
            href: '/orgs/org-123/projects/proj-456/funnel',
          },
        ],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    renderWithIntl(
      <McpCopilotChatBubble orgId="org-123" projectId="proj-456" initialOpen={true} />,
      { locale: 'en' },
    );

    const input = screen.getByTestId('copilot-chat-input');
    fireEvent.change(input, { target: { value: 'Analyze my conversion funnel' } });
    fireEvent.click(screen.getByTestId('copilot-send-button'));

    expect(screen.getByText('Analyze my conversion funnel')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('I analyzed your funnel drop-offs using MCP.')).toBeInTheDocument();
    });

    // Check MCP tool call pill
    expect(screen.getByTestId('mcp-tool-call-pill')).toBeInTheDocument();
    expect(screen.getByText('mcp.query_funnel')).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();

    // Toggle collapsible details
    fireEvent.click(screen.getByText('mcp.query_funnel'));
    await waitFor(() => {
      expect(screen.getByText('Arguments:')).toBeInTheDocument();
      expect(screen.getByText('15.2% overall conversion')).toBeInTheDocument();
    });

    // Check quick navigation action
    const quickActionBtn = screen.getByTestId('copilot-quick-action-link');
    expect(quickActionBtn).toHaveTextContent('Full Conversion Funnel →');
    fireEvent.click(quickActionBtn);
    expect(mockPush).toHaveBeenCalledWith('/orgs/org-123/projects/proj-456/funnel');
  });

  it('renders action proposal diff card and executes action via quick-execute API', async () => {
    const mockProposalResponse = {
      message: {
        id: 'asst-budget',
        role: 'assistant',
        content: 'I simulated budget change for Meta Retargeting.',
        timestamp: '12:35',
        actionProposal: {
          id: 'prop-123',
          targetId: 'tgt-meta-retargeting',
          targetLabel: 'Meta Retargeting Leads',
          actionType: 'budget_change',
          impactBadge: 'high',
          beforeValue: '$150/day',
          afterValue: '$250/day',
          estimatedImpact: '+32% projected conversions',
          status: 'awaiting_approval',
          payload: {
            targetId: 'tgt-meta-retargeting',
            actionType: 'budget_change',
            afterDailyBudgetUsd: 250,
          },
        },
      },
    };

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/copilot/chat')) {
        return {
          ok: true,
          json: async () => mockProposalResponse,
        };
      }
      if (url.includes('/automation/actions/quick-execute')) {
        return {
          ok: true,
          json: async () => ({ id: 'act-exec-1', status: 'executed' }),
        };
      }
      return { ok: false, status: 404 };
    });

    renderWithIntl(
      <McpCopilotChatBubble orgId="org-123" projectId="proj-456" initialOpen={true} />,
      { locale: 'en' },
    );

    const input = screen.getByTestId('copilot-chat-input');
    fireEvent.change(input, { target: { value: 'Scale Retargeting budget to $250' } });
    fireEvent.click(screen.getByTestId('copilot-send-button'));

    await waitFor(() => {
      expect(screen.getByTestId('copilot-action-proposal-card')).toBeInTheDocument();
    });

    expect(screen.getByText('Meta Retargeting Leads')).toBeInTheDocument();
    expect(screen.getByText('$150/day')).toBeInTheDocument();
    expect(screen.getByText('$250/day')).toBeInTheDocument();

    const executeBtn = screen.getByTestId('copilot-execute-action-btn');
    expect(executeBtn).toHaveTextContent('Approve & Execute');

    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(screen.getByTestId('copilot-action-executed-badge')).toBeInTheDocument();
      expect(screen.getByText('Action executed successfully!')).toBeInTheDocument();
    });
  });

  it('triggers quick prompt chip query directly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          id: 'asst-metrics',
          role: 'assistant',
          content: 'Here are the blended CAC and ROAS metrics.',
          timestamp: '12:40',
        },
      }),
    });

    renderWithIntl(
      <McpCopilotChatBubble orgId="org-123" projectId="proj-456" initialOpen={true} />,
      { locale: 'en' },
    );

    const chips = screen.getAllByTestId('copilot-quick-prompt-chip');
    expect(chips.length).toBeGreaterThan(0);

    fireEvent.click(chips[0]);

    await waitFor(() => {
      expect(screen.getByText('Query CAC & ROAS')).toBeInTheDocument();
      expect(screen.getByText('Here are the blended CAC and ROAS metrics.')).toBeInTheDocument();
    });
  });

  it('clears conversation and minimizes window', () => {
    renderWithIntl(
      <McpCopilotChatBubble orgId="org-123" projectId="proj-456" initialOpen={true} />,
      { locale: 'en' },
    );

    expect(screen.getByTestId('copilot-chat-window')).toBeInTheDocument();

    // Clear
    fireEvent.click(screen.getByTestId('copilot-clear-chat'));
    expect(screen.getByTestId('copilot-chat-window')).toBeInTheDocument();

    // Minimize
    fireEvent.click(screen.getByTestId('copilot-minimize-chat'));
    expect(screen.queryByTestId('copilot-chat-window')).not.toBeInTheDocument();
    expect(screen.getByTestId('copilot-bubble-trigger')).toBeInTheDocument();
  });
});
