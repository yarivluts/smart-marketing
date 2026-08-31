'use client';

import React, { useState, useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Search,
  XCircle,
} from 'lucide-react';
import type { BillingOpsFeedEntry, TransactionStatus } from './billing-types';
import { Button } from '@/components/ui/button';

export interface BillingOpsFeedProps {
  entries?: BillingOpsFeedEntry[];
  onExportCsv?: () => void;
  className?: string;
}

export const DEFAULT_BILLING_ENTRIES: BillingOpsFeedEntry[] = [
  {
    id: 'tx-1',
    type: 'charge',
    status: 'completed',
    amount: 1420,
    currency: 'USD',
    customerId: 'cust_8831',
    customerName: 'Acme LegalTech Corp',
    environmentId: 'env_prod',
    environmentName: 'Production',
    landedAt: '2026-08-31 14:22:10 UTC',
    clientId: 'client_stripe_01',
    gateway: 'stripe',
  },
  {
    id: 'tx-2',
    type: 'charge',
    status: 'completed',
    amount: 890,
    currency: 'USD',
    customerId: 'cust_9102',
    customerName: 'HyperGrowth Media',
    environmentId: 'env_prod',
    environmentName: 'Production',
    landedAt: '2026-08-31 11:45:00 UTC',
    clientId: 'client_stripe_01',
    gateway: 'stripe',
  },
  {
    id: 'tx-3',
    type: 'dunning',
    status: 'pending',
    amount: 420,
    currency: 'USD',
    customerId: 'cust_4412',
    customerName: 'FinEdge Systems',
    environmentId: 'env_prod',
    environmentName: 'Production',
    landedAt: '2026-08-30 09:12:44 UTC',
    clientId: 'client_stripe_01',
    failureMessage: 'Card declined: Insufficient funds (retry 2 of 3)',
    gateway: 'stripe',
  },
  {
    id: 'tx-4',
    type: 'refund',
    status: 'refunded',
    amount: 160,
    currency: 'USD',
    customerId: 'cust_2209',
    customerName: 'SoloDev Studio',
    environmentId: 'env_prod',
    environmentName: 'Production',
    landedAt: '2026-08-29 16:30:15 UTC',
    clientId: 'client_stripe_01',
    refundReason: 'Customer requested plan downgrade to Starter',
    gateway: 'stripe',
  },
];

export function BillingOpsFeed({
  entries: initialEntries = DEFAULT_BILLING_ENTRIES,
  onExportCsv,
  className = '',
}: BillingOpsFeedProps): React.ReactElement {
  const [entries] = useState<BillingOpsFeedEntry[]>(initialEntries);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TransactionStatus>('all');

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const query = searchQuery.toLowerCase();
      const matchesQuery =
        searchQuery.trim() === '' ||
        entry.id.toLowerCase().includes(query) ||
        (entry.customerId?.toLowerCase().includes(query) ?? false) ||
        (entry.customerName?.toLowerCase().includes(query) ?? false) ||
        entry.clientId.toLowerCase().includes(query);

      const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [entries, searchQuery, statusFilter]);

  const handleExport = () => {
    onExportCsv?.();
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['ID,Customer,Amount,Currency,Status,Date'].join(',') +
      '\n' +
      filteredEntries
        .map(
          (e) =>
            `${e.id},"${e.customerName || e.customerId || ''}",${e.amount || 0},${e.currency || 'USD'},${e.status},"${e.landedAt}"`,
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `billing_ops_feed_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      data-testid="billing-ops-feed"
      className={`flex flex-col gap-6 rounded-2xl border border-border/80 bg-card p-6 shadow-xs ${className}`}
    >
      {/* Header & Export */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              Billing & Operations Activity Feed
            </h3>
            <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Live Ingest
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time transaction stream, dunning recoveries, refunds, and churn audit log.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          data-testid="export-billing-csv-btn"
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export CSV</span>
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            data-testid="search-billing-input"
            placeholder="Search by customer, invoice ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background ps-9 pe-3 text-xs"
          />
        </div>

        <select
          data-testid="filter-billing-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | TransactionStatus)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-xs"
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending / In Dunning</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {/* Transaction List */}
      {filteredEntries.length === 0 ? (
        <div
          data-testid="empty-billing-feed"
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground"
        >
          <CreditCard className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium">No transactions match your search filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full text-xs text-start border-collapse">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground font-semibold">
                <th className="py-3 px-4 text-start">Transaction</th>
                <th className="py-3 px-3 text-start">Customer</th>
                <th className="py-3 px-3 text-end">Amount</th>
                <th className="py-3 px-3 text-start">Status</th>
                <th className="py-3 px-3 text-start">Environment</th>
                <th className="py-3 px-4 text-end">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredEntries.map((entry) => (
                <tr
                  key={entry.id}
                  data-testid={`billing-row-${entry.id}`}
                  className="hover:bg-muted/20 transition-colors"
                >
                  {/* Transaction ID & Type */}
                  <td className="py-3 px-4 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                          entry.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : entry.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : entry.status === 'refunded'
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {entry.type === 'charge' ? (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        ) : entry.type === 'refund' ? (
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                        ) : (
                          <CreditCard className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground uppercase text-[11px]">
                          {entry.type}
                        </span>
                        <span className="text-[10px] text-muted-foreground" dir="ltr">
                          {entry.id}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Customer */}
                  <td className="py-3 px-3">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">
                        {entry.customerName || entry.customerId || 'Direct Client'}
                      </span>
                      {entry.customerId && (
                        <span className="text-[10px] text-muted-foreground" dir="ltr">
                          {entry.customerId}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Amount */}
                  <td className="py-3 px-3 text-end font-bold text-foreground">
                    {entry.amount !== null && entry.currency ? (
                      <span dir="ltr">
                        {entry.type === 'refund' ? '-' : '+'}
                        ${entry.amount.toLocaleString()} {entry.currency.toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3 px-3">
                    <span
                      data-testid={`status-badge-${entry.id}`}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        entry.status === 'completed'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : entry.status === 'pending'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : entry.status === 'refunded'
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {entry.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                      {entry.status === 'pending' && <Clock className="h-3 w-3" />}
                      {entry.status === 'failed' && <XCircle className="h-3 w-3" />}
                      <span className="capitalize">{entry.status}</span>
                    </span>
                  </td>

                  {/* Environment */}
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
                      {entry.environmentName || entry.environmentId}
                    </span>
                  </td>

                  {/* Timestamp */}
                  <td className="py-3 px-4 text-end text-muted-foreground text-[11px]" dir="ltr">
                    {entry.landedAt}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
