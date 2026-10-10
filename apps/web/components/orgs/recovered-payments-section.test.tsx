import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { BillingRecoverySummary } from '@growthos/firebase-orm-models';
import { RecoveredPaymentsSection } from './recovered-payments-section';
import en from '../../messages/en.json';
import he from '../../messages/he.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

function summary(overrides: Partial<BillingRecoverySummary> = {}): BillingRecoverySummary {
  return {
    windowDays: 14,
    recoveries: [],
    recoveredByCurrency: [],
    failedAttempts: { recovered: 0, unrecovered: 0, pending: 0, unpairable: 0 },
    recoveryRate: null,
    medianHoursToRecover: null,
    failedPaymentsScanned: 0,
    chargesScanned: 0,
    failedPaymentsTruncated: false,
    chargesTruncated: false,
    ...overrides,
  };
}

function renderSection(value: BillingRecoverySummary, locale: 'en' | 'he' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : he} timeZone="UTC">
      <RecoveredPaymentsSection summary={value} />
    </NextIntlClientProvider>,
  );
}

const WITH_DATA = summary({
  recoveries: [
    {
      id: 'raw_ok_usd',
      customerId: 'cus_usd',
      currency: 'USD',
      amountMinorUnits: 4999,
      recoveryChargeId: 'ch_ok_usd',
      firstFailedAt: '2026-09-01T00:00:00.000Z',
      recoveredAt: '2026-09-04T00:00:00.000Z',
      failedAttempts: 2,
      hoursToRecover: 72,
      lastFailureCode: 'card_declined',
    },
    {
      id: 'raw_ok_jpy',
      customerId: 'cus_jpy',
      currency: 'JPY',
      amountMinorUnits: 3000,
      recoveryChargeId: 'ch_ok_jpy',
      firstFailedAt: '2026-09-01T00:00:00.000Z',
      recoveredAt: '2026-09-01T06:00:00.000Z',
      failedAttempts: 1,
      hoursToRecover: 6,
      lastFailureCode: null,
    },
  ],
  recoveredByCurrency: [
    { currency: 'USD', amountMinorUnits: 4999, payments: 1 },
    { currency: 'JPY', amountMinorUnits: 3000, payments: 1 },
  ],
  failedAttempts: { recovered: 3, unrecovered: 1, pending: 2, unpairable: 0 },
  recoveryRate: 0.75,
  medianHoursToRecover: 39,
  failedPaymentsScanned: 6,
  chargesScanned: 4,
});

describe('RecoveredPaymentsSection', () => {
  it('shows an honest empty state, not zeros, when no failed payment has landed', () => {
    renderSection(summary());
    expect(screen.getByText(en.BillingOpsFeed.recoveryEmpty)).toBeInTheDocument();
    expect(screen.queryByText(en.BillingOpsFeed.recoveryKpiRate)).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders per-currency recovered amounts with Intl, never a sum across currencies', () => {
    renderSection(WITH_DATA);
    const usd = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(49.99);
    const jpy = new Intl.NumberFormat('en', { style: 'currency', currency: 'JPY' }).format(3000);
    expect(screen.getByText(`${usd} · ${jpy}`)).toBeInTheDocument();
    expect(screen.getByText(new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(0.75))).toBeInTheDocument();
    expect(screen.getByText('3 of 4 failed attempts whose window has closed')).toBeInTheDocument();
    expect(screen.getByText('2 failed attempts are still inside the retry window and not counted as recovered or lost yet.')).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByText('cus_usd')).toBeInTheDocument();
    expect(within(table).getByText(usd)).toBeInTheDocument();
    expect(within(table).getByText('3 d')).toBeInTheDocument();
    expect(within(table).getByText('6 h')).toBeInTheDocument();
  });

  it('shows the rate as not available rather than 0% when no attempt has settled yet', () => {
    renderSection(summary({ failedAttempts: { recovered: 0, unrecovered: 0, pending: 1, unpairable: 0 }, failedPaymentsScanned: 1 }));
    expect(screen.getByText(en.BillingOpsFeed.recoveryKpiRatePending)).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByText(en.BillingOpsFeed.recoveryNoneYet)).toBeInTheDocument();
  });

  it('says when the scan was capped', () => {
    renderSection({ ...WITH_DATA, chargesTruncated: true });
    expect(screen.getByText(/older history was not read/)).toBeInTheDocument();
  });

  it('documents the window heuristic in the footer', () => {
    renderSection(WITH_DATA);
    expect(screen.getByText(/within 14 days of the failure/)).toBeInTheDocument();
  });

  it('renders in Hebrew from the translation file', () => {
    renderSection(WITH_DATA, 'he');
    expect(screen.getAllByText(he.BillingOpsFeed.recoveryHeading).length).toBeGreaterThan(0);
  });
});
