import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { WinEventHistoryList } from './win-event-history-list';
import type { WinEventFeedItem } from '@/lib/orgs/win-rule-view';
import messages from '../../messages/en.json';

const event: WinEventFeedItem = {
  id: 'win-1',
  winRuleName: 'Big order',
  winType: 'generic',
  schemaName: 'order_completed',
  clientId: 'ord_9001',
  payload: {},
  occurredAt: '2026-07-11T00:00:00.000Z',
  createdAt: '2026-07-11T00:00:00.000Z',
};

function renderList(events: WinEventFeedItem[]): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WinEventHistoryList events={events} />
    </NextIntlClientProvider>,
  );
}

describe('WinEventHistoryList', () => {
  it('shows an empty state when no wins have ever been recorded', () => {
    renderList([]);
    expect(screen.getByText('No wins recorded yet.')).toBeInTheDocument();
  });

  it('renders a persisted win even though the live feed never pushed it (the whole point of this list existing)', () => {
    renderList([event]);
    expect(screen.getByText('Big order — order_completed (ord_9001)')).toBeInTheDocument();
    expect(screen.getByText('2026-07-11T00:00:00.000Z')).toBeInTheDocument();
    expect(screen.queryByText('Trial conversion')).not.toBeInTheDocument();
  });

  it('shows a win-type badge for a KAN-66 catalog type, but not for generic', () => {
    renderList([{ ...event, winType: 'trial_conversion' }]);
    expect(screen.getByText('Trial conversion')).toBeInTheDocument();
  });

  it('shows a cap note with the count once there is at least one event', () => {
    renderList([event, { ...event, id: 'win-2' }]);
    expect(screen.getByText('Showing the most recent 2 win(s).')).toBeInTheDocument();
  });
});
