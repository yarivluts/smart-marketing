import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';

const { loadSharedAds } = vi.hoisted(() => ({ loadSharedAds: vi.fn() }));
vi.mock('@/lib/ad-studio/share', () => ({ loadSharedAds }));
vi.mock('next-intl/server', () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string, values?: Record<string, string>) => {
    const template = (enMessages.AdShare.public as Record<string, string>)[key];
    return template.replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? '');
  },
}));

import SharedAdsPage, { generateMetadata } from './page';

const params = (token: string) => ({ params: Promise.resolve({ locale: 'en', token }) });

describe('shared ads page', () => {
  it('shows the shared ads, titled by the brand, kept out of search and without a referrer', async () => {
    loadSharedAds.mockResolvedValue({ brandName: 'Acme', logoSrc: null, expiresOn: '2026-12-06T10:00:00.000Z', briefs: [] });
    renderWithIntl(await SharedAdsPage(params('tok')));
    expect(screen.getByTestId('shared-ads')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Ads for Acme' })).toBeInTheDocument();
    expect(await generateMetadata(params('tok'))).toEqual({ title: 'Ads for Acme', robots: { index: false, follow: false }, referrer: 'no-referrer' });
  });

  it('answers an inactive link with the same friendly page, whatever the reason', async () => {
    loadSharedAds.mockResolvedValue(null);
    renderWithIntl(await SharedAdsPage(params('gone')));
    expect(screen.getByTestId('shared-ads-inactive')).toBeInTheDocument();
    expect(await generateMetadata(params('gone'))).toEqual({ title: 'Your ads', robots: { index: false, follow: false }, referrer: 'no-referrer' });
  });
});
