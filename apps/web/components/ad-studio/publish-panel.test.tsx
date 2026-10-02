import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import { PublishPanel, type PublishCreative } from './publish-panel';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const CREATIVES: PublishCreative[] = [
  { key: 'c1-square', kind: 'image', id: 'img1', label: 'Idea 1 · Square', previewSrc: '/img1' },
  { key: 'video', kind: 'video', id: 'vid1', label: 'The video', previewSrc: '/vid1' },
];

function renderPanel(
  props: Partial<React.ComponentProps<typeof PublishPanel>> = {},
  locale: 'en' | 'he' = 'en',
) {
  return renderWithIntl(
    <PublishPanel
      orgId="o"
      projectId="p"
      briefId="b1"
      briefName="Sign fast"
      defaultLink="https://easysign.example"
      defaultPrimaryText="E-signatures for lawyers"
      creatives={CREATIVES}
      destinations={{ meta: true, google_ads: true }}
      canPublish
      published={[]}
      resourcesHref="/resources"
      {...props}
    />,
    { locale },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('PublishPanel', () => {
  it('publishes the search ad to Google Search: it switches to Google Ads, hides the feed copy and previews a results listing', async () => {
    const ad = {
      id: 'e9',
      destination: 'google_ads',
      mediaKind: 'search',
      title: 'Sign fast',
      status: 'done',
      externalUrl: 'https://ads.google.com/x',
      failureCode: null,
      requestedOn: '2026-10-02',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ad }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const search: PublishCreative = {
      key: 'search',
      kind: 'search',
      id: 'search',
      label: 'Search ad (Google)',
      previewSrc: '',
      search: {
        headlines: ['Sign in seconds', 'E-signatures', 'Start free'],
        descriptions: ['Upload, send, signed.'],
        path1: 'sign',
        path2: '',
        keywordCount: 12,
      },
    };
    renderPanel({ creatives: [...CREATIVES, search] });
    fireEvent.click(screen.getByTestId('ad-studio-publish-creative-search'));
    expect(screen.getByText('12 keywords')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Google Ads/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByLabelText(/Headline/)).not.toBeInTheDocument();
    expect(screen.getByTestId('ad-studio-search-preview')).toHaveTextContent(
      'Sign in seconds | E-signatures | Start free',
    );
    // Meta cannot run it.
    fireEvent.click(screen.getByRole('radio', { name: /Facebook/ }));
    expect(
      screen.getByText('A search ad runs on Google Search - choose Google Ads.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create paused ad on Facebook/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Google Ads/ }));
    fireEvent.click(screen.getByLabelText('No, it does not'));
    fireEvent.click(screen.getByRole('button', { name: 'Create paused ad on Google Ads' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({
      destination: 'google_ads',
      source: { kind: 'search' },
      containsEuPoliticalAdvertising: false,
    });
  });

  it('creates a paused Meta ad from the picked image and links to it', async () => {
    const ad = {
      id: 'e1',
      destination: 'meta',
      mediaKind: 'image',
      title: 'Sign fast',
      status: 'done',
      externalUrl: 'https://adsmanager.facebook.com/x',
      failureCode: null,
      requestedOn: '2026-09-29',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ad }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    fireEvent.change(screen.getByLabelText('Countries (e.g. IL, US)'), {
      target: { value: 'il, us' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create paused ad on Facebook & Instagram' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Created a paused ad on Facebook & Instagram.',
      ),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/orgs/o/projects/p/ad-studio/briefs/b1/publish');
    expect(JSON.parse(init.body as string)).toEqual({
      destination: 'meta',
      source: { kind: 'image', imageId: 'img1' },
      campaignName: 'Sign fast',
      copy: {
        headline: 'Sign fast',
        primaryText: 'E-signatures for lawyers',
        description: '',
        linkUrl: 'https://easysign.example',
        businessName: '',
      },
      dailyBudget: 20,
      countries: ['IL', 'US'],
    });
    expect(screen.getAllByRole('link', { name: 'Open the ad' })[0]).toHaveAttribute(
      'href',
      'https://adsmanager.facebook.com/x',
    );
    expect(screen.getAllByTestId('ad-studio-published-ad')).toHaveLength(1);
    expect(refresh).toHaveBeenCalled();
  });

  it('needs the EU declaration for Google and blocks a Google video ad', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: /Google Ads/ }));
    const create = screen.getByRole('button', { name: 'Create paused ad on Google Ads' });
    expect(create).toBeDisabled();
    fireEvent.click(screen.getByLabelText('No, it does not'));
    expect(create).toBeEnabled();

    fireEvent.click(
      screen
        .getByTestId('ad-studio-publish-creative-video')
        .querySelector('input') as HTMLInputElement,
    );
    expect(
      screen.getByText('Google video ads run from YouTube; pick an image for Google Ads.'),
    ).toBeInTheDocument();
    expect(create).toBeDisabled();
  });

  it('shows the explanation the platform gave for a failure next to ours', async () => {
    const ad = {
      id: 'e2',
      destination: 'meta',
      mediaKind: 'image',
      title: 'Sign fast',
      status: 'failed',
      externalUrl: null,
      failureCode: 'account_action_required',
      failureDetail: 'Verify your account',
      requestedOn: '2026-09-30',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ad }), { status: 502 })),
    );
    renderPanel();
    fireEvent.click(
      screen.getByRole('button', { name: 'Create paused ad on Facebook & Instagram' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Meta needs you to verify the account in Ads Manager',
      ),
    );
    expect(screen.getByTestId('ad-studio-publish-detail')).toHaveTextContent(
      'The platform said: Verify your account',
    );
  });

  it('shows the validation reasons the server gave', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: 'invalid_export', reasons: ['headline_too_long'] }),
            { status: 400 },
          ),
        ),
    );
    renderPanel();
    fireEvent.click(
      screen.getByRole('button', { name: 'Create paused ad on Facebook & Instagram' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Check the ad details: headline_too_long',
      ),
    );
  });

  it('cannot publish an unconnected platform or without permission, in Hebrew too', () => {
    renderPanel(
      { destinations: { meta: false, google_ads: true }, canPublish: false, creatives: [] },
      'he',
    );
    expect(screen.getByText(heMessages.AdStudio.publish.nothingReady)).toBeInTheDocument();
    expect(
      screen.getByText(heMessages.AdStudio.publish.connectFirst, { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText(heMessages.AdStudio.publish.historyEmpty)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\u05e4\u05d9\u05d9\u05e1\u05d1\u05d5\u05e7 \u05d5\u05d0\u05d9\u05e0\u05e1\u05d8\u05d2\u05e8\u05dd/ })).toBeDisabled();
  });

  it('offers Connect with Facebook where Meta is not connected and the viewer may connect accounts', () => {
    const { unmount } = renderPanel({
      destinations: { meta: false, google_ads: true },
      metaConnectHref: '/api/integrations/meta/start?orgId=o',
    });
    expect(screen.getByTestId('ad-studio-connect-meta')).toHaveAttribute(
      'href',
      '/api/integrations/meta/start?orgId=o',
    );
    // Google Ads is connected, so no connect link there.
    fireEvent.click(screen.getByRole('radio', { name: /Google Ads/ }));
    expect(screen.queryByTestId('ad-studio-connect-meta')).toBeNull();
    unmount();
    // Without the right (or with no Meta app configured) it points to the resources page instead.
    renderPanel({ destinations: { meta: false, google_ads: true }, metaConnectHref: null });
    expect(screen.queryByTestId('ad-studio-connect-meta')).toBeNull();
    expect(screen.getByRole('link', { name: /resources/i })).toHaveAttribute('href', '/resources');
  });
});
