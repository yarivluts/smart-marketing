import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { REVIEW_POLL_MS, ReviewOverview, type ReviewOverviewProps } from './review-overview';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
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
  video: { kind: 'video', state: 'working', scenes: 3, rendered: 2, previewClipId: 'k1', assembled: false, assembledSeconds: 0, hasCopy: false, generating: false },
  search: { kind: 'search', state: 'empty', headlines: 0, descriptions: 0, keywords: 0, sample: null, sampleSecond: null, sampleDescription: null },
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
    expect(video).toHaveTextContent('2 of 3 scenes made');
    expect(video).not.toHaveTextContent('assemble the video');

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

  it('says when every scene is ready but the video is not assembled, and reads the search ad in the ad direction', () => {
    renderWithIntl(
      <ReviewOverview {...PROPS} adDirection="rtl" video={{ ...PROPS.video, rendered: 3 }} search={{ ...PROPS.search, state: 'ready', headlines: 3, descriptions: 2, sample: 'Sign fast', sampleSecond: 'Free trial', sampleDescription: 'Contracts signed on WhatsApp.' }} searchHost="easysign.co.il" />,
      { locale: 'en' },
    );
    expect(screen.getByTestId('ad-studio-creative-video')).toHaveTextContent('Every scene is ready - assemble the video');
    const preview = screen.getByTestId('ad-studio-search-preview');
    expect(preview).toHaveAttribute('dir', 'rtl');
    expect(preview).toHaveTextContent('Sign fast | Free trial');
    expect(preview).toHaveTextContent('Contracts signed on WhatsApp.');
    expect(preview).toHaveTextContent('easysign.co.il');
  });

  it('leads with the next step: the first creative that needs a look, highlighted, with the way to publish', () => {
    renderWithIntl(<ReviewOverview {...PROPS} publishHref="/r?step=publish" />, { locale: 'en' });
    const next = screen.getByTestId('ad-studio-review-next');
    expect(next).toHaveAttribute('data-next', 'attention');
    expect(next).toHaveTextContent('One ad needs a look');
    expect(screen.getByTestId('ad-studio-review-next-action')).toHaveAttribute('href', '/r?item=image:c2');
    expect(screen.getByTestId('ad-studio-review-next-publish')).toHaveAttribute('href', '/r?step=publish');
    expect(screen.getByTestId('ad-studio-creative-image-2')).toHaveAttribute('data-highlight', 'attention');
    expect(screen.getByTestId('ad-studio-creative-image-1')).not.toHaveAttribute('data-highlight');
  });

  it('asks to assemble the video once every scene is rendered, and offers publishing when all is ready', () => {
    const ready = { ...PROPS.images[1], state: 'ready' as const };
    const { unmount } = renderWithIntl(<ReviewOverview {...PROPS} images={[PROPS.images[0], ready]} video={{ ...PROPS.video, rendered: 3 }} />, { locale: 'he' });
    expect(screen.getByTestId('ad-studio-review-next')).toHaveTextContent(heMessages.AdStudio.review.next.assemble.title);
    expect(screen.getByTestId('ad-studio-review-next-action')).toHaveAttribute('href', '/r?item=video');
    expect(screen.getByTestId('ad-studio-creative-video')).toHaveAttribute('data-highlight', 'action');
    expect(screen.queryByTestId('ad-studio-review-next-publish')).toBeNull();
    unmount();

    renderWithIntl(
      <ReviewOverview {...PROPS} images={[PROPS.images[0], ready]} video={{ ...PROPS.video, state: 'ready', rendered: 3, assembled: true, assembledSeconds: 15 }} publishHref="/r?step=publish" />,
      { locale: 'en' },
    );
    expect(screen.getByTestId('ad-studio-review-next')).toHaveTextContent('3 ads are ready');
    expect(screen.getByTestId('ad-studio-review-next-action')).toHaveAttribute('href', '/r?step=publish');
    expect(screen.queryByTestId('ad-studio-review-next-publish')).toBeNull();
  });

  it('calls the things to review "ads", not the marketing word "creatives", in both languages', () => {
    const copy = (messages: { AdStudio: { review: unknown } }) => JSON.stringify(messages.AdStudio.review);
    expect(copy(enMessages)).not.toMatch(/creative/i);
    expect(copy(heMessages)).not.toContain('קריאייטיב');
    renderWithIntl(<ReviewOverview {...PROPS} />, { locale: 'en' });
    expect(screen.getByRole('heading', { name: 'Your ads' })).toBeInTheDocument();
  });

  it('offers to start image ideas when there are none, in Hebrew', () => {
    renderWithIntl(<ReviewOverview {...PROPS} images={[]} />, { locale: 'he' });
    const empty = screen.getByTestId('ad-studio-creative-images-empty');
    expect(empty).toHaveAttribute('href', '/r?item=images');
    expect(empty).toHaveTextContent(heMessages.AdStudio.review.imagesEmpty);
  });

  describe('while something is still being made', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      refresh.mockClear();
    });

    it('keeps the page current, asking for clip status first while a clip renders', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
      vi.stubGlobal('fetch', fetchMock);
      renderWithIntl(<ReviewOverview {...PROPS} images={[PROPS.images[0]]} video={{ ...PROPS.video, generating: true }} />, { locale: 'en' });
      expect(refresh).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(REVIEW_POLL_MS);
      expect(fetchMock).toHaveBeenCalledWith('/m/render-status', { cache: 'no-store' });
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('refreshes for an image still rendering without asking for clip status, and stays still when nothing is', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const rendering = { ...PROPS.images[0], state: 'working' as const, placements: [{ format: 'square' as const, state: 'working' as const }] };
      const { unmount } = renderWithIntl(<ReviewOverview {...PROPS} images={[rendering]} />, { locale: 'en' });
      await vi.advanceTimersByTimeAsync(REVIEW_POLL_MS);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
      unmount();
      refresh.mockClear();

      renderWithIntl(<ReviewOverview {...PROPS} images={[PROPS.images[0]]} />, { locale: 'en' });
      await vi.advanceTimersByTimeAsync(REVIEW_POLL_MS * 3);
      expect(refresh).not.toHaveBeenCalled();
    });
  });
});
