import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { BillingOpsFeed } from './billing-ops-feed';
import { PlanSummaryCard } from './plan-summary-card';
import { InvoicesTable } from './invoices-table';

describe('Billing & Operations Feed Components (Milestone 3)', () => {
  it('renders BillingOpsFeed with transaction cards and status badges', () => {
    renderWithIntl(<BillingOpsFeed />);

    expect(screen.getByTestId('billing-ops-feed')).toBeInTheDocument();
    expect(screen.getByText('Acme LegalTech Corp')).toBeInTheDocument();
    expect(screen.getByText('HyperGrowth Media')).toBeInTheDocument();
    expect(screen.getByTestId('status-badge-tx-1')).toHaveTextContent('completed');
  });

  it('filters billing transactions by search query', () => {
    renderWithIntl(<BillingOpsFeed />);

    const searchInput = screen.getByTestId('search-billing-input');
    fireEvent.change(searchInput, { target: { value: 'HyperGrowth' } });

    expect(screen.queryByText('Acme LegalTech Corp')).not.toBeInTheDocument();
    expect(screen.getByText('HyperGrowth Media')).toBeInTheDocument();
  });

  it('filters billing transactions by status filter dropdown', () => {
    renderWithIntl(<BillingOpsFeed />);

    const select = screen.getByTestId('filter-billing-status');
    fireEvent.change(select, { target: { value: 'refunded' } });

    expect(screen.queryByText('Acme LegalTech Corp')).not.toBeInTheDocument();
    expect(screen.getByText('SoloDev Studio')).toBeInTheDocument();
  });

  it('renders PlanSummaryCard with usage meters and upgrade button', () => {
    const handleUpgrade = vi.fn();
    renderWithIntl(<PlanSummaryCard onUpgrade={handleUpgrade} />);

    expect(screen.getByTestId('plan-summary-card')).toBeInTheDocument();
    expect(screen.getByText('Growth Scale Enterprise')).toBeInTheDocument();
    expect(screen.getByText(/14 \/ 25/)).toBeInTheDocument();

    const upgradeBtn = screen.getByTestId('upgrade-plan-btn');
    fireEvent.click(upgradeBtn);
    expect(handleUpgrade).toHaveBeenCalledTimes(1);
  });

  it('renders InvoicesTable with invoice list and handles download click', () => {
    const handleDownload = vi.fn();
    renderWithIntl(<InvoicesTable onDownloadPdf={handleDownload} />);

    expect(screen.getByTestId('invoices-table-card')).toBeInTheDocument();
    expect(screen.getByText('INV-2026-08')).toBeInTheDocument();

    const downloadBtn = screen.getByTestId('download-invoice-inv-101');
    fireEvent.click(downloadBtn);
    expect(handleDownload).toHaveBeenCalledWith('inv-101');
  });
});
