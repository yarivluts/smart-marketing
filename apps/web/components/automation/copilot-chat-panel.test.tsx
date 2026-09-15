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
      expect(screen.getByText(/Action submitted\./)).toBeInTheDocument();
    });
  });

  it('provides quick prompt chips to trigger instant queries', async () => {
    renderWithIntl(<CopilotChatPanel initialMessages={[]} />, { locale: 'en' });

    const chips = screen.getAllByRole('button');
    const topAdsChip = chips.find((c) => c.textContent?.includes('Top Ads'));
    expect(topAdsChip).toBeDefined();

    if (topAdsChip) {
      fireEvent.click(topAdsChip);
      expect(screen.getByText('What are top ads this week?')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText(/top performing ads this week/i)).toBeInTheDocument();
      });
    }
  });
  /**
   * The failure path used to append the success message verbatim - the catch block was a
   * copy of the happy path - and the happy path never checked the response, so a 400 or 403
   * from the propose endpoint resolved normally and also read as success. Both halves are
   * pinned here.
   */
  it('reports a rejected proposal as failed rather than executed', async () => {
    const onExecuteProposal = vi.fn().mockRejectedValue(new Error('propose rejected'));
    renderWithIntl(<CopilotChatPanel initialMessages={[]} onExecuteProposal={onExecuteProposal} />, { locale: 'en' });

    fireEvent.change(screen.getByTestId('copilot-input'), {
      target: { value: 'Increase budget for retargeting campaign to $250' },
    });
    fireEvent.click(screen.getByTestId('copilot-send-button'));

    await waitFor(() => expect(screen.getByTestId('proposal-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('quick-execute-button'));

    await waitFor(() => {
      expect(screen.getByText(/did not go through/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Action submitted\./)).not.toBeInTheDocument();
  });

  it('treats a non-ok HTTP response from the propose endpoint as a failure', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 403 }));

    renderWithIntl(<CopilotChatPanel initialMessages={[]} orgId="org-1" projectId="proj-1" />, {
      locale: 'en',
    });

    fireEvent.change(screen.getByTestId('copilot-input'), {
      target: { value: 'Increase budget for retargeting campaign to $250' },
    });
    fireEvent.click(screen.getByTestId('copilot-send-button'));

    await waitFor(() => expect(screen.getByTestId('proposal-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('quick-execute-button'));

    await waitFor(() => {
      expect(screen.getByText(/did not go through/i)).toBeInTheDocument();
    });

    fetchSpy.mockRestore();
  });
});
