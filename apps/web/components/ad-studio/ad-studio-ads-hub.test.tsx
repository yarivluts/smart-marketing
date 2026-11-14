import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { AdStudioAdsHub, type AdStudioListBrief } from './ad-studio-ads-hub';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const SAMPLE_BRIEFS: AdStudioListBrief[] = [
  {
    id: 'b-scripted',
    name: 'Galileo Business Launch',
    objective: 'Drive qualified demos from SMB finance teams',
    format: 'vertical',
    language: 'he',
    status: 'scripted',
    host: 'galileo-app.co.il',
    scenes: [
      { id: 's1', durationSeconds: 5 },
      { id: 's2', durationSeconds: 10 },
      { id: 's3', durationSeconds: 5 },
    ],
    hasPlan: true,
    imageConceptCount: 3,
    hasSearchAd: true,
    keywordCount: 12,
    lastChangedOn: '2026-11-12T10:00:00.000Z',
  },
  {
    id: 'b-planned',
    name: 'B2B Growth Funnel',
    objective: 'Capture signups from SaaS leaders',
    format: 'horizontal',
    language: 'en',
    status: 'planned',
    host: 'galileo-app.com',
    scenes: [],
    hasPlan: true,
    imageConceptCount: 0,
    hasSearchAd: false,
    keywordCount: 0,
    lastChangedOn: '2026-11-11T09:00:00.000Z',
  },
  {
    id: 'b-draft',
    name: 'Quick Invoice Promo',
    objective: 'Increase mobile app downloads',
    format: 'vertical',
    language: 'en',
    status: 'draft',
    host: null,
    scenes: [],
    hasPlan: false,
    imageConceptCount: 0,
    hasSearchAd: false,
    keywordCount: 0,
    lastChangedOn: '2026-11-10T08:00:00.000Z',
  },
];

describe('AdStudioAdsHub', () => {
  it('shows the empty state and keeps the manual brief form collapsed on mobile until toggled', () => {
    renderWithIntl(
      <AdStudioAdsHub orgId="org-1" projectId="proj-1" studioHref="/orgs/org-1/projects/proj-1/ad-studio" knownSite="https://example.co.il" briefs={[]} />,
      { locale: 'en' },
    );

    expect(screen.getByText(enMessages.AdStudio.adsListEmptyTitle)).toBeInTheDocument();
    expect(screen.getByText(enMessages.AdStudio.adsListEmpty)).toBeInTheDocument();
    expect(screen.getByTestId('ad-studio-from-site')).toBeInTheDocument();
    expect(screen.getByTestId('ad-studio-brief-create')).toBeInTheDocument();

    const toggle = screen.getByTestId('ad-studio-manual-toggle');
    const wrap = screen.getByTestId('ad-studio-manual-form-wrap');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(wrap.className).toContain('max-md:hidden');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(wrap.className).not.toContain('max-md:hidden');
  });

  it('renders rich mobile ad cards with real creative-mix pills and filters by stage and search query', () => {
    renderWithIntl(
      <AdStudioAdsHub orgId="org-1" projectId="proj-1" studioHref="/orgs/org-1/projects/proj-1/ad-studio" knownSite={null} briefs={SAMPLE_BRIEFS} />,
      { locale: 'en' },
    );

    const cards = screen.getAllByTestId('ad-studio-brief-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveAttribute('href', '/orgs/org-1/projects/proj-1/ad-studio?brief=b-scripted');
    expect(within(cards[0]).getByText('galileo-app.co.il')).toBeInTheDocument();
    expect(within(cards[0]).getByText(enMessages.AdStudio.list.chipPlan)).toBeInTheDocument();
    expect(within(cards[0]).getByText(enMessages.AdStudio.list.chipSearch)).toBeInTheDocument();
    expect(within(cards[0]).getByTestId('ad-studio-timeline')).toBeInTheDocument();
    expect(within(cards[2]).getByText(enMessages.AdStudio.noScenesYetShort)).toBeInTheDocument();
    expect(within(cards[2]).queryByText(enMessages.AdStudio.list.chipPlan)).toBeNull();

    // Filter by status stage
    fireEvent.click(screen.getByTestId('ad-studio-filter-scripted'));
    expect(screen.getAllByTestId('ad-studio-brief-card')).toHaveLength(1);
    expect(screen.getByText('Galileo Business Launch')).toBeInTheDocument();

    // Filter back to all and search by domain host
    fireEvent.click(screen.getByTestId('ad-studio-filter-all'));
    expect(screen.getAllByTestId('ad-studio-brief-card')).toHaveLength(3);

    const search = screen.getByPlaceholderText(enMessages.AdStudio.list.searchPlaceholder);
    fireEvent.change(search, { target: { value: 'galileo-app.com' } });
    expect(screen.getAllByTestId('ad-studio-brief-card')).toHaveLength(1);
    expect(screen.getByText('B2B Growth Funnel')).toBeInTheDocument();

    // No match state + reset action
    fireEvent.change(search, { target: { value: 'nonexistent-query' } });
    expect(screen.getByTestId('ad-studio-no-matches')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: enMessages.AdStudio.list.resetFilters }));
    expect(screen.getAllByTestId('ad-studio-brief-card')).toHaveLength(3);
  });

  it('renders localized Hebrew copy cleanly when locale is he', () => {
    renderWithIntl(
      <AdStudioAdsHub orgId="org-1" projectId="proj-1" studioHref="/orgs/org-1/projects/proj-1/ad-studio" knownSite={null} briefs={SAMPLE_BRIEFS} />,
      { locale: 'he' },
    );

    expect(screen.getByRole('heading', { name: heMessages.AdStudio.adsListTitle })).toBeInTheDocument();
    expect(screen.getByTestId('ad-studio-mobile-new-cta')).toHaveTextContent(heMessages.AdStudio.list.newAdShortcut);
    expect(screen.getByPlaceholderText(heMessages.AdStudio.list.searchPlaceholder)).toBeInTheDocument();
    expect(screen.getByTestId('ad-studio-filter-scripted')).toHaveTextContent(heMessages.AdStudio.status.scripted);
  });
});
