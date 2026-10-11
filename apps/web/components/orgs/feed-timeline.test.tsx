import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { FeedTimeline } from './feed-timeline';

describe('FeedTimeline', () => {
  it('renders each day group with its records, amounts and emphasized lines', () => {
    render(
      <FeedTimeline
        label="Billing events"
        groups={[
          {
            key: '2026-08-02',
            label: 'Sun, Aug 2',
            items: [
              { id: '1', tone: 'error', title: 'Failed payment', aside: '4,999 USD', lines: [{ text: 'Failure: card declined', emphasis: true }], meta: 'Landed 10:00' },
              { id: '2', tone: 'ok', title: 'Charge' },
            ],
          },
          { key: '2026-08-01', label: 'Sat, Aug 1', items: [{ id: '3', tone: 'warn', title: 'Refund' }] },
        ]}
      />,
    );
    const timeline = screen.getByRole('list', { name: 'Billing events' });
    const days = within(timeline).getAllByRole('listitem').filter((item) => item.parentElement === timeline);
    expect(days).toHaveLength(2);
    expect(within(days[0]).getByText('Sun, Aug 2')).toBeInTheDocument();
    expect(within(days[0]).getByText('4,999 USD')).toHaveAttribute('dir', 'ltr');
    expect(within(days[0]).getByText('Failure: card declined')).toHaveClass('text-destructive');
    expect(within(days[0]).getByText('Landed 10:00')).toBeInTheDocument();
    expect(within(days[1]).getByText('Refund')).toBeInTheDocument();
  });
});
