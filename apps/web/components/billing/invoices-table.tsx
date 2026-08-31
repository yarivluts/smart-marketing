'use client';

import React from 'react';
import { CheckCircle2, Download, FileText } from 'lucide-react';
import type { InvoiceItem } from './billing-types';

export interface InvoicesTableProps {
  invoices?: InvoiceItem[];
  onDownloadPdf?: (invoiceId: string) => void;
  className?: string;
}

export const DEFAULT_INVOICES: InvoiceItem[] = [
  {
    id: 'inv-101',
    invoiceNumber: 'INV-2026-08',
    amount: 799,
    currency: 'USD',
    status: 'paid',
    invoiceDate: '2026-08-01',
  },
  {
    id: 'inv-100',
    invoiceNumber: 'INV-2026-07',
    amount: 799,
    currency: 'USD',
    status: 'paid',
    invoiceDate: '2026-07-01',
  },
  {
    id: 'inv-099',
    invoiceNumber: 'INV-2026-06',
    amount: 799,
    currency: 'USD',
    status: 'paid',
    invoiceDate: '2026-06-01',
  },
];

export function InvoicesTable({
  invoices = DEFAULT_INVOICES,
  onDownloadPdf,
  className = '',
}: InvoicesTableProps): React.ReactElement {
  return (
    <div
      data-testid="invoices-table-card"
      className={`flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-6 shadow-xs ${className}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground">Invoices & Receipts</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Download previous tax invoices and payment receipts.
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-4 w-4" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full text-xs text-start border-collapse">
          <thead>
            <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground font-semibold">
              <th className="py-2.5 px-4 text-start">Invoice Number</th>
              <th className="py-2.5 px-3 text-start">Date</th>
              <th className="py-2.5 px-3 text-end">Amount</th>
              <th className="py-2.5 px-3 text-start">Status</th>
              <th className="py-2.5 px-4 text-end">Receipt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                <td className="py-2.5 px-4 font-semibold text-foreground" dir="ltr">
                  {inv.invoiceNumber}
                </td>
                <td className="py-2.5 px-3 text-muted-foreground" dir="ltr">
                  {inv.invoiceDate}
                </td>
                <td className="py-2.5 px-3 text-end font-bold text-foreground" dir="ltr">
                  ${inv.amount.toLocaleString()} {inv.currency.toUpperCase()}
                </td>
                <td className="py-2.5 px-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    <span className="capitalize">{inv.status}</span>
                  </span>
                </td>
                <td className="py-2.5 px-4 text-end">
                  <button
                    type="button"
                    data-testid={`download-invoice-${inv.id}`}
                    onClick={() => onDownloadPdf?.(inv.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    <Download className="h-3 w-3" />
                    <span>PDF</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
