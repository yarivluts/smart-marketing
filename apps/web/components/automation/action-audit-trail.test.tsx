import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { ActionAuditTrail, type AuditActionItem } from './action-audit-trail';

describe('ActionAuditTrail Component', () => {
  const mockActions: AuditActionItem[] = [
    {
      id: 'act-1',
      targetId: 'tgt-1',
      targetLabel: 'Google Search Campaign',
      actionType: 'budget_change',
      status: 'executed',
      beforeDailyBudgetUsd: 100,
      afterDailyBudgetUsd: 200,
      executedAt: '2026-08-31 14:00',
    },
    {
      id: 'act-2',
      targetId: 'tgt-2',
      targetLabel: 'Meta Retargeting Campaign',
      actionType: 'bid_strategy_change',
      status: 'rolled_back',
      diffEntries: [{ key: 'Strategy', before: 'Manual', after: 'Target ROAS' }],
      rolledBackAt: '2026-08-31 15:30',
    },
    {
      id: 'act-3',
      targetId: 'tgt-3',
      targetLabel: 'TikTok Lead Gen',
      actionType: 'status_toggle',
      status: 'awaiting_approval',
      executedAt: '2026-08-31 16:00',
    },
  ];

  it('renders table headers and audit action items correctly', () => {
    renderWithIntl(<ActionAuditTrail actions={mockActions} />, { locale: 'en' });

    expect(screen.getByTestId('audit-trail-container')).toBeInTheDocument();
    expect(screen.getByText('Google Search Campaign')).toBeInTheDocument();
    expect(screen.getByText('Meta Retargeting Campaign')).toBeInTheDocument();
    expect(screen.getByText('TikTok Lead Gen')).toBeInTheDocument();
    expect(screen.getByTestId('status-act-1')).toHaveTextContent('executed');
    expect(screen.getByTestId('status-act-2')).toHaveTextContent('rolled_back');
  });

  it('filters actions using search query input', () => {
    renderWithIntl(<ActionAuditTrail actions={mockActions} />, { locale: 'en' });

    const searchInput = screen.getByTestId('audit-search-input');
    fireEvent.change(searchInput, { target: { value: 'Google' } });

    expect(screen.getByText('Google Search Campaign')).toBeInTheDocument();
    expect(screen.queryByText('Meta Retargeting Campaign')).not.toBeInTheDocument();
    expect(screen.queryByText('TikTok Lead Gen')).not.toBeInTheDocument();
  });

  it('filters actions by status pill tabs', () => {
    renderWithIntl(<ActionAuditTrail actions={mockActions} />, { locale: 'en' });

    // Filter by Rolled Back
    const rolledBackTab = screen.getByTestId('filter-status-rolled-back');
    fireEvent.click(rolledBackTab);

    expect(screen.getByText('Meta Retargeting Campaign')).toBeInTheDocument();
    expect(screen.queryByText('Google Search Campaign')).not.toBeInTheDocument();
  });

  it('triggers 1-Click Rollback for executed action and calls onRollback callback', async () => {
    const onRollback = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(<ActionAuditTrail actions={mockActions} onRollback={onRollback} />, { locale: 'en' });

    const rollbackBtn = screen.getByTestId('rollback-btn-act-1');
    expect(rollbackBtn).toBeInTheDocument();

    fireEvent.click(rollbackBtn);

    await waitFor(() => {
      expect(onRollback).toHaveBeenCalledWith('act-1');
    });
  });
});
