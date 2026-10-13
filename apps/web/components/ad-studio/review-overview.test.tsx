import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import { ReviewOverview, type ReviewOverviewProps } from './review-overview';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const PROPS: ReviewOverviewProps = {
  mediaBase: '/m',
  videoFormat: 'vertical',
  hrefs: { image: { c1: '/r?item=image:c1', c2: '/r?item=image:c2' }, images: '/r?item=images', video: '/r?item=video', search: '/r?item=search' },
  images: [
    { kind: 'image', conceptId: 'c1', index: 1, headline: 'Sign in 30 seconds', state: 'ready', preview: { imageId: 'i1', format: 'square' }, placements: [{ format: 'square', state: 'ready' }], hasCopy: true },
    { kind: 'image', conceptId: 'c2', index: 2, headline: '', state: 'attention', preview: null, placements: [{ format: 'story', state: 'attention' }], hasCopy: false },
  ],
  video: { kind: 'video', state: 'working', scenes: 3, rendered: 2, previewClipId: 'k1', assembled: false, assembledSeconds: 0, hasCopy: false },
  search: { kind: 'search', state: 'empty', headlines: 0, descriptions: 0, keywords: 0, sample: null },
};

describe('ReviewOverview', () => {
  it('shows each creative as a card that opens its own page, with a preview and where it stands', () => {
    renderWithIntl(<ReviewOverview {...PROPS} />, { locale: 'en' });
    const first = screen.getByTestId('ad-studio-creative-image-1');
    expect(first).toHaveAttribute('href', '/r?item=image:c1');
    expect(within(first).getByRole('img')).toHaveAttribute('src', '/m/images/i1/media');
    expect(first).toHaveTextContent('Image idea 1');
    expect(first).toHaveTextContent('Sign in 30 seconds');
    expect(within(first).getByTestId('ad-studio-creative-state')).toHaveTextContent('Ready');
    expect(first).toHaveTextContent('Ad text written');

    const second = screen.getByTestId('ad-studio-creative-image-2');
    expect(within(second).getByTestId('ad-studio-creative-state')).toHaveTextContent('Needs a look');
    expect(second).toHaveTextContent('No ad text yet');

    const video = screen.getByTestId('ad-studio-creative-video');
    expect(video).toHaveAttribute('href', '/r?item=video');
    expect(video.querySelector('video')).toHaveAttribute('src', '/m/clips/k1/media#t=0.1');
    expect(video).toHaveTextContent('2 of 3 scenes rendered');

    const search = screen.getByTestId('ad-studio-creative-search');
    expect(search).toHaveAttribute('href', '/r?item=search');
    expect(search).toHaveTextContent('No keywords chosen');
    expect(within(search).getByTestId('ad-studio-creative-state')).toHaveTextContent('Not started');
  });

  it('counts what is ready and what needs a look, and links to the page for all image ideas', () => {
    renderWithIntl(<ReviewOverview {...PROPS} />, { locale: 'en' });
    const counts = screen.getByTestId('ad-studio-review-counts');
    expect(counts).toHaveTextContent('1 ready');
    expect(counts).toHaveTextContent('1 need a look');
    expect(counts).toHaveTextContent('1 in progress');
    expect(screen.getByTestId('ad-studio-review-manage-ideas')).toHaveAttribute('href', '/r?item=images');
  });

  it('offers to start image ideas when there are none, in Hebrew', () => {
    renderWithIntl(<ReviewOverview {...PROPS} images={[]} />, { locale: 'he' });
    const empty = screen.getByTestId('ad-studio-creative-images-empty');
    expect(empty).toHaveAttribute('href', '/r?item=images');
    expect(empty).toHaveTextContent(heMessages.AdStudio.review.imagesEmpty);
  });
});
