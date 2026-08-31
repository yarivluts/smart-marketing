import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { CopilotChatPanel } from './copilot-chat-panel';

describe('CopilotChatPanel Component', () => {
  it('renders chat interface with correct direction in English and Hebrew', () => {
    const { unmount } = renderWithIntl(<CopilotChatPanel initialMessages={[]} />, { locale: 'en' });
    expect(screen.getByTestId('copilot-chat-container')).toHaveAttribute('dir', 'ltr');
    unmount();

    renderWithIntl(<CopilotChatPanel initialMessages={[]} />, { locale: 'he' });
    expect(screen.getByTestId('copilot-chat-container')).toHaveAttribute('dir', 'rtl');
  });

  it('sends user message and displays natural language Hebrew analytics response', async () => {
    renderWithIntl(<CopilotChatPanel initialMessages={[]} />, { locale: 'he' });

    const input = screen.getByTestId('copilot-input');
    fireEvent.change(input, { target: { value: 'אילו מודעות הכי רווחיות השבוע?' } });
    fireEvent.click(screen.getByTestId('copilot-send-button'));

    expect(screen.getByText('אילו מודעות הכי רווחיות השבוע?')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/המודעות הכי רווחיות השבוע הן במודעות Meta עם ROAS של 4.2x/)).toBeInTheDocument();
    });
  });

  it('renders proposal card upon budget increase intent and triggers quick execution', async () => {
    const onExecuteProposal = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(<CopilotChatPanel initialMessages={[]} onExecuteProposal={onExecuteProposal} />, { locale: 'en' });

    const input = screen.getByTestId('copilot-input');
    fireEvent.change(input, { target: { value: 'Increase budget for retargeting campaign to $250' } });
    fireEvent.click(screen.getByTestId('copilot-send-button'));

    await waitFor(() => {
      expect(screen.getByTestId('proposal-card')).toBeInTheDocument();
    });
    expect(screen.getByText('Meta Retargeting Leads')).toBeInTheDocument();
    expect(screen.getByText('$150/day')).toBeInTheDocument();
    expect(screen.getByText('$250/day')).toBeInTheDocument();

    const quickExecBtn = screen.getByTestId('quick-execute-button');
    expect(quickExecBtn).toHaveTextContent('1-Click Approve & Execute');
    fireEvent.click(quickExecBtn);

    await waitFor(() => {
      expect(onExecuteProposal).toHaveBeenCalled();
      expect(screen.getByText(/Action executed successfully! Rollback is available in audit log./)).toBeInTheDocument();
    });
  });

  it('provides quick prompt chips to trigger instant queries', () => {
    renderWithIntl(<CopilotChatPanel initialMessages={[]} />, { locale: 'en' });

    const chips = screen.getAllByRole('button');
    const topAdsChip = chips.find((c) => c.textContent?.includes('Top Ads'));
    expect(topAdsChip).toBeDefined();

    if (topAdsChip) {
      fireEvent.click(topAdsChip);
      expect(screen.getByText('What are top ads this week?')).toBeInTheDocument();
    }
  });
});
