import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
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
