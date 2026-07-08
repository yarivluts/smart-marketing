import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EventVolumeSparkline } from './event-volume-sparkline';
import messages from '../../messages/en.json';

function renderSparkline(dailyCounts: { date: string; count: number }[]): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EventVolumeSparkline dailyCounts={dailyCounts} />
    </NextIntlClientProvider>,
  );
}

describe('EventVolumeSparkline', () => {
  it('renders one bar per day and summarizes the total in its accessible label', () => {
    renderSparkline([
      { date: '2026-07-01', count: 0 },
      { date: '2026-07-02', count: 3 },
      { date: '2026-07-03', count: 5 },
    ]);

    const image = screen.getByRole('img', { name: '8 events over the trailing 7 days' });
    expect(image.children).toHaveLength(3);
  });

  it('renders an accessible label with zero total when every day is empty', () => {
    renderSparkline([{ date: '2026-07-01', count: 0 }]);

    expect(screen.getByRole('img', { name: '0 events over the trailing 7 days' })).toBeInTheDocument();
  });
});
