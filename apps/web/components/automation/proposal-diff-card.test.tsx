import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { ProposalDiffCard, type ActionProposalData } from './proposal-diff-card';

describe('ProposalDiffCard Component', () => {
  const mockProposal: ActionProposalData = {
    id: 'prop-1',
    targetId: 'tgt-1',
    targetLabel: 'Meta Retargeting Leads',
    actionType: 'budget_change',
    platform: 'meta_ads',
    impactBadge: 'high',
    beforeValue: '$150/day',
    afterValue: '$250/day',
    diffEntries: [{ key: 'Daily Budget', before: '$150/day', after: '$250/day' }],
    estimatedImpact: '+32% projected conversions',
    status: 'awaiting_approval',
  };

  it('renders target label, impact badge, and before/after diff values', () => {
    renderWithIntl(<ProposalDiffCard proposal={mockProposal} />, { locale: 'en' });

    expect(screen.getByTestId('proposal-card')).toBeInTheDocument();
    expect(screen.getByText('Meta Retargeting Leads')).toBeInTheDocument();
    expect(screen.getByTestId('impact-badge')).toHaveTextContent('high impact');
    expect(screen.getByTestId('before-diff')).toHaveTextContent('$150/day');
    expect(screen.getByTestId('after-diff')).toHaveTextContent('$250/day');
    expect(screen.getByText('+32% projected conversions')).toBeInTheDocument();
  });

  it('triggers onApprove when 1-Click Approve button is clicked', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(<ProposalDiffCard proposal={mockProposal} onApprove={onApprove} />, { locale: 'en' });

    const btn = screen.getByTestId('quick-execute-button');
    expect(btn).toHaveTextContent('1-Click Approve & Execute');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith(mockProposal);
      expect(screen.getByTestId('proposal-status-badge')).toHaveTextContent('executed');
    });
  });

  it('triggers onReject when reject button is clicked', async () => {
    const onReject = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(<ProposalDiffCard proposal={mockProposal} onReject={onReject} />, { locale: 'en' });

    const rejectBtn = screen.getByTestId('reject-proposal-button');
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(onReject).toHaveBeenCalledWith(mockProposal);
      expect(screen.getByTestId('proposal-status-badge')).toHaveTextContent('rejected');
    });
  });

  it('shows 1-Click Rollback button for executed proposals and triggers onRollback', async () => {
    const onRollback = vi.fn().mockResolvedValue(undefined);
    const executedProposal: ActionProposalData = {
      ...mockProposal,
      status: 'executed',
    };

    renderWithIntl(<ProposalDiffCard proposal={executedProposal} onRollback={onRollback} />, { locale: 'en' });

    const rollbackBtn = screen.getByTestId('proposal-rollback-button');
    expect(rollbackBtn).toHaveTextContent('1-Click Rollback');
    fireEvent.click(rollbackBtn);

    await waitFor(() => {
      expect(onRollback).toHaveBeenCalledWith(executedProposal);
      expect(screen.getByTestId('proposal-status-badge')).toHaveTextContent('rolled_back');
    });
  });

  it('renders guardrail warning banner when guardrail warning is present', () => {
    const warningProposal: ActionProposalData = {
      ...mockProposal,
      guardrailWarning: 'Exceeds standard 50% daily budget change threshold',
    };

    renderWithIntl(<ProposalDiffCard proposal={warningProposal} />, { locale: 'en' });

    expect(screen.getByTestId('guardrail-warning-banner')).toBeInTheDocument();
    expect(screen.getByText('Exceeds standard 50% daily budget change threshold')).toBeInTheDocument();
  });
});
