import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import type { SharedAdsPage } from '@/lib/ad-studio/share-view';
import { SharedAdsInactive, SharedAdsView, sharedImagePlacements } from './shared-ads-view';

const PAGE: SharedAdsPage = {
  brandName: 'Acme Clinic',
  logoSrc: '/api/share/ads/T/logo',
  expiresOn: '2026-12-06T10:00:00.000Z',
  briefs: [
    {
      id: 'b1',
      name: 'Spring sale',
      language: 'en',
      landingPageUrl: 'https://acme.example/spring',
      images: [{ conceptId: 'c1', index: 1, copy: { headline: 'Book today', primaryText: 'Spring is here', description: '' }, byFormat: { square: '/api/share/ads/T/briefs/b1/images/i1', story: '/api/share/ads/T/briefs/b1/images/i2' } }],
      video: { src: '/api/share/ads/T/briefs/b1/videos/v1', vertical: true, copy: { headline: 'Watch', primaryText: 'See the clinic', description: '' }, durationSeconds: 14.6 },
    },
  ],
};

describe('SharedAdsView', () => {
  it('shows the brand and each shared ad in the platform mock-ups with its copy, read-only', () => {
    renderWithIntl(<SharedAdsView page={PAGE} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ads for Acme Clinic' })).toBeInTheDocument();
    expect(screen.getByAltText('Acme Clinic')).toHaveAttribute('src', '/api/share/ads/T/logo');
    expect(screen.getByText(/View only - link valid until Dec 6, 2026/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Spring sale' })).toBeInTheDocument();

    const video = screen.getByTestId('shared-video');
    expect(within(video).getByText('Video (15 sec)')).toBeInTheDocument();
    expect(within(video).getByLabelText('Video ad: Spring sale').getAttribute('src')).toContain('/api/share/ads/T/briefs/b1/videos/v1');
    expect(within(video).getByText('See the clinic')).toBeInTheDocument();

    const idea = screen.getByTestId('shared-image');
    expect(within(idea).getByText('Idea 1')).toBeInTheDocument();
    expect(within(idea).getByText('Spring is here')).toBeInTheDocument();
    // Only the placements with their own image are offered: no "no image for this spot" mock-ups.
    expect(within(idea).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Facebook feed', 'Instagram feed', 'Instagram story / Reels', 'Google websites and apps']);
    fireEvent.click(within(idea).getByRole('tab', { name: 'Instagram story / Reels' }));
    expect(within(idea).getByAltText('Book today')).toHaveAttribute('src', '/api/share/ads/T/briefs/b1/images/i2');
    expect(within(idea).queryByTestId('ad-preview-format-note')).toBeNull();
    // The brand logo is the avatar of every mock-up.
    expect(within(idea).getAllByTestId('ad-studio-brand-avatar')[0]).toHaveAttribute('src', '/api/share/ads/T/logo');

    // Nothing to edit, publish or delete.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /publish|delete|edit/i })).toBeNull();
  });

  it('without a brand name or ready ads, says so plainly', () => {
    renderWithIntl(<SharedAdsView page={{ ...PAGE, brandName: ' ', logoSrc: null, briefs: [] }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Your ads' })).toBeInTheDocument();
    expect(screen.getByTestId('shared-ads-empty')).toHaveTextContent('No finished ads to show yet');
  });

  it('reads in Hebrew', () => {
    renderWithIntl(<SharedAdsView page={PAGE} />, { locale: 'he' });
    expect(screen.getByRole('heading', { level: 1, name: heMessages.AdShare.public.titleWithBrand.replace('{brand}', 'Acme Clinic') })).toBeInTheDocument();
    expect(screen.getByText(heMessages.AdShare.public.idea.replace('{index}', '1'))).toBeInTheDocument();
  });

  it('offers every image placement when an idea has none of its own', () => {
    expect(sharedImagePlacements({ landscape: '/x' })).toEqual(['google_display']);
    expect(sharedImagePlacements({ story: '/x' })).toEqual(['instagram_story']);
    expect(sharedImagePlacements({})).toHaveLength(4);
  });
});

describe('SharedAdsInactive', () => {
  it('says the link is no longer active without telling why', () => {
    renderWithIntl(<SharedAdsInactive />);
    expect(screen.getByRole('heading', { name: 'This link is no longer active' })).toBeInTheDocument();
    renderWithIntl(<SharedAdsInactive />, { locale: 'he' });
    expect(screen.getByRole('heading', { name: heMessages.AdShare.public.inactiveTitle })).toBeInTheDocument();
  });
});

describe('SharedAdsView — campaign results, Search ad, revision & interactive feedback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders campaign results, Search ad preview, revision badge, and lets client approve & leave a note only after clicking toggle', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? '{}'));
      return new Response(
        JSON.stringify({
          item: {
            id: payload.verdict === 'approved' ? 'fb-approved' : 'fb-note',
            shareLinkId: 'lnk-1',
            clientLabel: 'Acme',
            authorName: payload.authorName ?? '',
            targetKind: payload.targetKind,
            briefId: payload.briefId ?? null,
            briefName: 'Spring launch',
            creativeRef: null,
            campaignId: payload.campaignId ?? null,
            campaignLabel: payload.campaignLabel ?? null,
            verdict: payload.verdict,
            comment: payload.comment ?? '',
            status: 'open',
            createdOn: '2026-11-18T10:00:00.000Z',
            resolvedOn: null,
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const richPage: SharedAdsPage = {
      brandName: 'Acme Clinic',
      logoSrc: null,
      expiresOn: '2026-12-06T00:00:00.000Z',
      token: 'T-LIVE',
      includeResults: true,
      allowFeedback: true,
      revisionNumber: 2,
      revisionNote: 'Stronger opening hook',
      results: {
        totalSpendUsd: 4200,
        metaSpendUsd: 2600,
        googleSpendUsd: 1600,
        activeCampaignsCount: 2,
        totalCampaignsCount: 2,
        campaignsWithSpendCount: 2,
        items: [
          {
            id: 'cmp-1',
            label: 'Search — Dental Implants',
            platform: 'google_ads',
            status: 'enabled',
            dailyBudgetUsd: 120,
            totalSpendUsd: 1600,
            roas: 4.2,
            ctrPct: 5.1,
            conversions: 32,
          },
        ],
      },
      briefs: [
        {
          id: 'b1',
          name: 'Spring launch',
          language: 'en',
          landingPageUrl: 'https://acme.example',
          images: [],
          video: null,
          searchAd: {
            headlines: ['Book Smile Consult', 'Trusted Dental Care', 'Free 3D Scan'],
            descriptions: ['Transparent pricing and experienced specialists.', 'Same-week appointments available.'],
            path1: 'implants',
            path2: 'book',
            displayUrl: 'acme.example/implants/book',
          },
        },
      ],
    };

    renderWithIntl(<SharedAdsView page={richPage} />);

    // Security & UX invariant: zero textboxes before explicit toggle click, and zero publish/delete/edit buttons.
    expect(screen.queryByRole('textbox')).toBeNull();
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.textContent ?? '').not.toMatch(/publish|delete|edit/i);
    }

    expect(screen.getByTestId('shared-ads-revision')).toHaveTextContent('Updated version #2');
    expect(screen.getByTestId('shared-ads-revision')).toHaveTextContent('Stronger opening hook');
    expect(screen.getByTestId('shared-campaign-results')).toHaveTextContent('Search — Dental Implants');
    expect(screen.getByTestId('shared-search-ad')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('shared-brief-approve-b1'));
    const notesBox = await screen.findByTestId('shared-submitted-feedback-list');
    expect(within(notesBox).getByText('Approved')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('shared-brief-note-toggle-b1'));
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText('e.g. Dana Cohen'), { target: { value: 'Dana' } });
    fireEvent.change(screen.getByPlaceholderText(/Tell the agency what works well/), {
      target: { value: 'Emphasize 24h response time in headline 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to agency' }));

    await waitFor(() => expect(screen.queryByTestId('shared-feedback-form')).toBeNull());
    expect(screen.getByText('Emphasize 24h response time in headline 1')).toBeInTheDocument();
  });

  it('renders pre-publication preview (draft banner, storyboard with scene clip, draft concepts, meta & campaign drafts) without edit controls', () => {
    const prePublishPage: SharedAdsPage = {
      brandName: 'Acme Clinic',
      logoSrc: null,
      expiresOn: '2026-12-06T00:00:00.000Z',
      token: 'T-PRE',
      includeResults: false,
      allowFeedback: true,
      includeDrafts: true,
      briefs: [
        {
          id: 'b-draft',
          name: 'Unpublished Dental Promo',
          language: 'en',
          landingPageUrl: 'https://acme.example/promo',
          isPrePublishDraft: true,
          draftMeta: {
            objective: 'Book free 3D dental scans',
            productDescription: 'Same-week consultation',
            format: 'vertical',
            targetSeconds: 15,
            keywords: ['dental scan', 'implants'],
            audienceSummary: 'IL · 25-55',
          },
          images: [
            {
              conceptId: 'c-unrendered',
              index: 1,
              copy: { headline: 'Smile with confidence', primaryText: 'Book your scan today.', description: '' },
              byFormat: {},
              isDraft: true,
              headline: 'Smile with confidence',
              visualPrompt: 'Bright clinic reception in sunlight',
              plannedFormats: ['square', 'story'],
            },
          ],
          video: null,
          videoCopyDraft: { headline: 'See the clinic', primaryText: 'Modern dental care', description: '' },
          scenes: [
            {
              id: 's1',
              index: 1,
              durationSeconds: 5,
              narration: 'Welcome to Acme Clinic',
              onScreenText: 'Free 3D scan',
              visualPrompt: 'Doctor greeting patient',
              clipSrc: '/api/share/ads/T-PRE/briefs/b-draft/clips/k1',
            },
          ],
        },
      ],
      campaignDrafts: [
        {
          targetId: 't-draft-1',
          campaignName: 'Pre-launch Meta Lead Campaign',
          platform: 'meta',
          dailyBudgetUsd: 50,
          ads: [
            {
              groupName: 'Local Adults',
              headline: 'Free Dental Consult',
              primaryText: 'Reserve your slot before launch.',
              description: 'Limited spots',
              linkUrl: 'https://acme.example/promo',
              audience: 'IL (25-55)',
            },
          ],
        },
      ],
    };

    renderWithIntl(<SharedAdsView page={prePublishPage} />);

    expect(screen.getByTestId('shared-ads-prepublish-banner')).toBeInTheDocument();
    expect(screen.getByTestId('shared-brief-prepublish-badge')).toHaveTextContent('Before launch');
    expect(screen.getByTestId('shared-brief-meta')).toHaveTextContent('Book free 3D dental scans');
    expect(screen.getByTestId('shared-image-draft')).toHaveTextContent('Bright clinic reception in sunlight');
    const storyboard = screen.getByTestId('shared-video-storyboard');
    expect(within(storyboard).getByLabelText('Scene 1 video')).toHaveAttribute('src', '/api/share/ads/T-PRE/briefs/b-draft/clips/k1');
    expect(screen.getByTestId('shared-campaign-drafts')).toHaveTextContent('Pre-launch Meta Lead Campaign');
    expect(screen.queryByTestId('shared-ads-empty')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.textContent ?? '').not.toMatch(/publish|delete|edit/i);
    }
  });
});

describe('SharedAdsView — failed feedback send', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tells the client nothing was sent and to check the connection, then keeps their note', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    const page: SharedAdsPage = {
      brandName: 'Acme Clinic',
      logoSrc: null,
      expiresOn: '2026-12-06T00:00:00.000Z',
      token: 'T-FAIL',
      allowFeedback: true,
      briefs: [
        {
          id: 'b1',
          name: 'Spring launch',
          language: 'en',
          landingPageUrl: 'https://acme.example',
          images: [],
          video: null,
        },
      ],
    } as SharedAdsPage;
    renderWithIntl(<SharedAdsView page={page} />);
    fireEvent.click(screen.getByTestId('shared-brief-note-toggle-b1'));
    fireEvent.change(screen.getByPlaceholderText(/Tell the agency what works well/), {
      target: { value: 'Make it shorter' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to agency' }));
    const alert = await screen.findByText(/was not sent, nothing was saved/);
    expect(alert).toHaveTextContent(/internet connection/);
    expect(alert.textContent).not.toMatch(/fields/);
    expect(screen.getByDisplayValue('Make it shorter')).toBeInTheDocument();
  });
});
