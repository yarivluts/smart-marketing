import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { AdStudioSiteScrollPageView } from '@growthos/shared';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import { SiteScrollPanel } from './site-scroll-panel';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const SCENES = [{ id: 'scene-1' }, { id: 'scene-2' }];
const PAGES: AdStudioSiteScrollPageView[] = [
  {
    id: 'page-1',
    url: 'https://easysign.example.com/',
    hostAndPath: 'easysign.example.com',
    title: 'Easy Sign Home',
    kind: 'home',
    relevanceReason: 'Homepage overview',
    screenshotUrl: '/api/orgs/o/projects/p/ad-studio/briefs/b1/site-pages/page-1/media?kind=image',
    videoUrl: '/api/orgs/o/projects/p/ad-studio/briefs/b1/site-pages/page-1/media?kind=video',
    durationSeconds: 4,
    selected: true,
    capturedOn: '2026-11-18T08:00:00.000Z',
  },
  {
    id: 'page-2',
    url: 'https://easysign.example.com/pricing',
    hostAndPath: 'easysign.example.com/pricing',
    title: 'Pricing & Plans',
    kind: 'product',
    relevanceReason: 'Relevant pricing overview',
    screenshotUrl: '/api/orgs/o/projects/p/ad-studio/briefs/b1/site-pages/page-2/media?kind=image',
    videoUrl: '/api/orgs/o/projects/p/ad-studio/briefs/b1/site-pages/page-2/media?kind=video',
    durationSeconds: 4,
    selected: false,
    capturedOn: '2026-11-18T08:00:00.000Z',
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SiteScrollPanel', () => {
  it('auto-scans the website once on mount when linkUrl exists and no pages are scanned yet', async () => {
    const fetchMock = vi.fn(async () => json({ sitePages: PAGES }));
    vi.stubGlobal('fetch', fetchMock);
    const onScanned = vi.fn();

    renderWithIntl(
      <SiteScrollPanel
        orgId="o"
        projectId="p"
        briefId="b1"
        linkUrl="https://easysign.example.com"
        initialPages={[]}
        scenes={SCENES}
        onScanned={onScanned}
      />,
      { locale: 'en' },
    );

    await waitFor(() => expect(screen.getByTestId('ad-studio-site-scroll-page-1')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/orgs/o/projects/p/ad-studio/briefs/b1/site-pages',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onScanned).toHaveBeenCalledWith(PAGES);
    expect(screen.getByTestId('ad-studio-site-scroll-page-2')).toHaveTextContent('Pricing & Plans');
  });

  it('updates auto-weave selection with PATCH and sends selected page to scene callback', async () => {
    const updated = [PAGES[0]!, { ...PAGES[1]!, selected: true }];
    const fetchMock = vi.fn(async () => json({ sitePages: updated }));
    vi.stubGlobal('fetch', fetchMock);
    const onUseInScene = vi.fn(async () => undefined);

    renderWithIntl(
      <SiteScrollPanel
        orgId="o"
        projectId="p"
        briefId="b1"
        linkUrl="https://easysign.example.com"
        initialPages={PAGES}
        scenes={SCENES}
        onUseInScene={onUseInScene}
      />,
      { locale: 'en' },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('ad-studio-site-scroll-toggle-2'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/orgs/o/projects/p/ad-studio/briefs/b1/site-pages',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ selectedPageIds: ['page-1', 'page-2'] }),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId('ad-studio-site-scroll-toggle-2')).toBeChecked());

    fireEvent.click(screen.getByTestId('ad-studio-site-scroll-use-1'));
    await waitFor(() => expect(onUseInScene).toHaveBeenCalledWith('page-1', 'scene-1'));
    await waitFor(() => expect(screen.getByTestId('ad-studio-site-scroll-use-1')).not.toBeDisabled());
  });

  it('renders RTL Hebrew labels and empty hint when no website link is saved yet', () => {
    renderWithIntl(
      <SiteScrollPanel
        orgId="o"
        projectId="p"
        briefId="b1"
        linkUrl={null}
        initialPages={[]}
        scenes={SCENES}
      />,
      { locale: 'he' },
    );

    expect(screen.getByTestId('ad-studio-site-scroll')).toHaveTextContent(heMessages.AdStudio.siteScroll.title);
    expect(screen.getByTestId('ad-studio-site-scroll')).toHaveTextContent(heMessages.AdStudio.siteScroll.emptyHint);
  });
});
