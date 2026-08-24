import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RepCollectionLeaderboardWidget } from './rep-collection-leaderboard-widget';
import type { RepCollectionLeaderboardView } from '@/lib/orgs/rep-collection-view';
import messages from '../../messages/en.json';

function renderWidget(view: RepCollectionLeaderboardView) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RepCollectionLeaderboardWidget view={view} />
    </NextIntlClientProvider>,
  );
}

const emptyView: RepCollectionLeaderboardView = { periodStart: '2026-08-24', periodEnd: '2026-08-30', rows: [], unattributedTotal: 0, unattributedCount: 0 };

describe('RepCollectionLeaderboardWidget', () => {
  it('shows a translated empty state when nothing has been logged this week', () => {
    renderWidget(emptyView);
    expect(screen.getByText('No attributed collections yet this week.')).toBeInTheDocument();
  });

  it('ranks reps by total, highest first, with their entry count', () => {
    renderWidget({
      ...emptyView,
      rows: [
        { orgPersonId: 'person-1', name: 'Dana Rep', totalAmount: 500, entryCount: 2 },
        { orgPersonId: 'person-2', name: 'Sam Rep', totalAmount: 100, entryCount: 1 },
      ],
    });
    expect(screen.getByText('1. Dana Rep')).toBeInTheDocument();
    expect(screen.getByText('500 (2 entries)')).toBeInTheDocument();
    expect(screen.getByText('2. Sam Rep')).toBeInTheDocument();
    expect(screen.getByText('100 (1 entry)')).toBeInTheDocument();
  });

  it('shows only the top 5 rows', () => {
    renderWidget({
      ...emptyView,
      rows: Array.from({ length: 7 }, (_, index) => ({ orgPersonId: `person-${index}`, name: `Rep ${index}`, totalAmount: 100 - index, entryCount: 1 })),
    });
    expect(screen.getByText('1. Rep 0')).toBeInTheDocument();
    expect(screen.getByText('5. Rep 4')).toBeInTheDocument();
    expect(screen.queryByText('6. Rep 5')).not.toBeInTheDocument();
  });

  it('surfaces the unattributed total even when it is the only activity this week', () => {
    renderWidget({ ...emptyView, unattributedTotal: 250, unattributedCount: 3 });
    expect(screen.queryByText('No attributed collections yet this week.')).not.toBeInTheDocument();
    expect(screen.getByText('Plus 250 not yet attributed (3 entries)')).toBeInTheDocument();
  });

  it('shows both ranked rows and the unattributed line together', () => {
    renderWidget({ ...emptyView, rows: [{ orgPersonId: 'person-1', name: 'Dana Rep', totalAmount: 500, entryCount: 1 }], unattributedTotal: 50, unattributedCount: 1 });
    expect(screen.getByText('1. Dana Rep')).toBeInTheDocument();
    expect(screen.getByText('Plus 50 not yet attributed (1 entry)')).toBeInTheDocument();
  });
});
