import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import React from 'react';
import { Clock, ImageIcon, Sparkles } from 'lucide-react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { AdHeader, meterLevel } from './ad-header';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('meterLevel', () => {
  it('fills the bar by the share of the daily limit and marks it reached at or past the limit', () => {
    expect(meterLevel(10, 40)).toEqual({ percent: 25, reached: false });
    expect(meterLevel(40, 40)).toEqual({ percent: 100, reached: true });
    expect(meterLevel(184, 40)).toEqual({ percent: 100, reached: true });
    expect(meterLevel(0, 0)).toEqual({ percent: 0, reached: false });
    expect(meterLevel(1, 0)).toEqual({ percent: 100, reached: true });
  });
});

describe('AdHeader', () => {
  it('names the ad under a breadcrumb back to all ads, with its actions and one row of usage meters', () => {
    renderWithIntl(
      <AdHeader
        studioLabel="AI Ad Studio"
        allAds={{ label: 'All ads', href: '/ad-studio' }}
        name="EasySign - sign in 30 seconds"
        objective="Get small law firms to try EasySign"
        actions={<button type="button">Delete ad</button>}
        usage={{
          label: "Today's AI usage",
          limitReached: 'Limit reached',
          meters: [
            { key: 'images', label: 'Images today', used: 184, limit: 40, icon: ImageIcon },
            { key: 'text', label: 'Ad texts written today', used: 12, limit: 50, icon: Sparkles },
            { key: 'video', label: 'Video seconds today', used: 15, limit: 300, icon: Clock },
          ],
        }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('EasySign - sign in 30 seconds');
    expect(screen.getByTestId('ad-studio-all-ads')).toHaveAttribute('href', '/ad-studio');
    expect(screen.getByRole('navigation', { name: 'AI Ad Studio' })).toHaveTextContent('EasySign - sign in 30 seconds');
    expect(screen.getByRole('button', { name: 'Delete ad' })).toBeInTheDocument();
    const images = screen.getByTestId('ad-studio-usage-images');
    expect(images).toHaveAttribute('data-reached', 'true');
    expect(images).toHaveTextContent('Limit reached');
    expect(images).toHaveTextContent('184/40');
    const text = screen.getByTestId('ad-studio-usage-text');
    expect(text).not.toHaveAttribute('data-reached');
    expect(text).not.toHaveTextContent('Limit reached');
    expect(text).toHaveTextContent('12/50');
  });
});
