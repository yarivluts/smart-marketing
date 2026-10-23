import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { GrowthPerformanceSection } from './performance-section';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), Link: ({ children }: { children: React.ReactNode }) => children }));

const SUMMARY = {
  totals: { spend: 84.5, impressions: 12_400, clicks: 310, linkClicks: 260, conversions: 12, ctr: 0.025, cpc: 84.5 / 310, costPerConversion: 84.5 / 12 },
  daily: [
    { date: '2026-10-13', spend: 40, impressions: 6000, clicks: 150, conversions: 5 },
    { date: '2026-10-14', spend: 44.5, impressions: 6400, clicks: 160, conversions: 7 },
  ],
  byTarget: { t1: { spend: 84.5, impressions: 12_400, clicks: 310, linkClicks: 260, conversions: 12, ctr: 0.025, cpc: 0.27, costPerConversion: 7.04 } },
};

afterEach(() => vi.unstubAllGlobals());

function stub(...bodies: unknown[]) {
  const fetchMock = vi.fn();
  for (const body of bodies) fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('GrowthPerformanceSection', () => {
  it('shows what Meta reported - spend, reach, clicks with CTR, cost per click and conversions - and a daily chart', async () => {
    const fetchMock = stub({ status: 'ok', since: '2026-09-15', until: '2026-10-14', summary: SUMMARY });
    const onTargets = vi.fn();
    renderWithIntl(<GrowthPerformanceSection base="/api/x/growth-pilot" onTargets={onTargets} />, { locale: 'en' });
    expect(await screen.findByTestId('growth-pilot-kpi-spend')).toHaveTextContent('84.5');
    expect(fetchMock).toHaveBeenCalledWith('/api/x/growth-pilot/performance?days=30');
    expect(screen.getByTestId('growth-pilot-kpi-impressions')).toHaveTextContent('12.4K');
    expect(screen.getByTestId('growth-pilot-kpis')).toHaveTextContent('2.5% of the people who saw an ad clicked it');
    expect(screen.getByTestId('growth-pilot-kpi-cpc')).toHaveTextContent('0.27');
    expect(screen.getByTestId('growth-pilot-kpis')).toHaveTextContent('7.04 for each sign-up or sale');
    expect(screen.getByRole('table', { hidden: true })).toHaveTextContent('10-14');
    expect(onTargets).toHaveBeenCalledWith(SUMMARY.byTarget);
  });

  it('switches the period, and says why when Meta cannot be read', async () => {
    const fetchMock = stub({ status: 'ok', since: 'a', until: 'b', summary: SUMMARY }, { status: 'unavailable', reason: 'no_meta_credential' });
    renderWithIntl(<GrowthPerformanceSection base="/b" />, { locale: 'en' });
    await screen.findByTestId('growth-pilot-kpis');
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/b/performance?days=7'));
    expect(await screen.findByTestId('growth-pilot-performance-unavailable')).toHaveTextContent('Connect your Facebook and Instagram ad account');
  });

  it('says the ads have not been shown yet when Meta has no impressions, and hides itself before anything is published', async () => {
    stub({ status: 'ok', since: 'a', until: 'b', summary: { ...SUMMARY, totals: { ...SUMMARY.totals, impressions: 0, clicks: 0, ctr: null, cpc: null } } });
    const { unmount } = renderWithIntl(<GrowthPerformanceSection base="/b" />, { locale: 'en' });
    expect(await screen.findByText(/have not been shown yet/)).toBeInTheDocument();
    expect(screen.getByTestId('growth-pilot-kpi-cpc')).toHaveTextContent('-');
    unmount();
    stub({ status: 'none' });
    const { container } = renderWithIntl(<GrowthPerformanceSection base="/b" />, { locale: 'en' });
    await waitFor(() => expect(container.querySelector('[data-testid="growth-pilot-performance"]')).toBeNull());
  });

  it('reads a failed request as no numbers, never as a crash', async () => {
    vi.stubGlobal('fetch', vi.fn(() => undefined));
    renderWithIntl(<GrowthPerformanceSection base="/b" />, { locale: 'en' });
    expect(await screen.findByTestId('growth-pilot-performance-unavailable')).toHaveTextContent('Facebook and Instagram did not return the numbers');
  });
});
