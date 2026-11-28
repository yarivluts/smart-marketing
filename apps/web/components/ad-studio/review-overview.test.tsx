import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import type { AdStudioRunView } from '@/lib/ad-studio/view';
import { REVIEW_POLL_MS, ReviewOverview, type ReviewOverviewProps } from './review-overview';

const refresh = vi.fn();
const push = vi.fn();
const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/use-toast', () => ({ toast: toastMock }));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh, push }),
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
  video: { kind: 'video', state: 'working', scenes: 3, rendered: 2, previewClipId: 'k1', assembled: false, assembledSeconds: 0, hasCopy: false, generating: false, outOfDate: 0 },
  search: { kind: 'search', state: 'empty', headlines: 0, descriptions: 0, keywords: 0, sample: null, sampleSecond: null, sampleDescription: null },
};

describe('ReviewOverview', () => {
  it('shows each creative as a card that opens its own page, with a preview and where it stands', () => {
    renderWithIntl(<ReviewOverview {...PROPS} />, { locale: 'en' });
    const first = screen.getByTestId('ad-studio-creative-image-1');
    expect(within(first).getByTestId('ad-studio-creative-image-1-open')).toHaveAttribute('href', '/r?item=image:c1');
    expect(within(first).getByRole('img')).toHaveAttribute('src', '/m/images/i1/media');
    expect(first).toHaveTextContent('Image idea 1');
    expect(first).toHaveTextContent('Sign in 30 seconds');
    expect(within(first).getByTestId('ad-studio-creative-state')).toHaveTextContent('Ready');
    expect(first).toHaveTextContent('Ad text written');

    const second = screen.getByTestId('ad-studio-creative-image-2');
    expect(within(second).getByTestId('ad-studio-creative-state')).toHaveTextContent('Needs a look');
    expect(second).toHaveTextContent('No ad text yet');

    const video = screen.getByTestId('ad-studio-creative-video');
    expect(within(video).getByTestId('ad-studio-creative-video-open')).toHaveAttribute('href', '/r?item=video');
    expect(video.querySelector('video')).toHaveAttribute('src', '/m/clips/k1/media#t=0.1');
    expect(video).toHaveTextContent('2 of 3 scenes made');
    expect(video).not.toHaveTextContent('assemble the video');

    const search = screen.getByTestId('ad-studio-creative-search');
    expect(within(search).getByTestId('ad-studio-creative-search-open')).toHaveAttribute('href', '/r?item=search');
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

  it('says how many scenes need re-making instead of "assemble" when their clips are out of date (he)', () => {
    renderWithIntl(<ReviewOverview {...PROPS} video={{ ...PROPS.video, state: 'attention', rendered: 0, outOfDate: 3 }} />, { locale: 'he' });
    const card = screen.getByTestId('ad-studio-creative-video');
    expect(card).toHaveTextContent('3 סצנות צריכות יצירה מחדש');
    expect(card).not.toHaveTextContent('נשאר להרכיב');
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
    expect(within(empty).getByTestId('ad-studio-creative-images-empty-open')).toHaveAttribute('href', '/r?item=images');
    expect(empty).toHaveTextContent(heMessages.AdStudio.review.imagesEmpty);
  });

  it('shows a pre-publication share shortcut button when shareHref is provided', () => {
    renderWithIntl(<ReviewOverview {...PROPS} shareHref="/r?open=share" />, { locale: 'en' });
    expect(screen.getByTestId('ad-studio-review-share')).toHaveAttribute('href', '/r?open=share');
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

  describe('quick creation, live progress, inline AI revisions and completion alerts', () => {
    function jsonResponse(body: unknown, status = 200): Response {
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }

    function makeRun(overrides: Partial<AdStudioRunView> = {}): AdStudioRunView {
      return {
        id: 'run-search-1',
        status: 'running',
        options: {
          plan: true,
          images: false,
          imageFormats: ['square', 'portrait'],
          video: false,
          search: true,
          siteEnrich: true,
          target: 'search',
          targetConceptId: null,
          siteUrl: null,
          instruction: null,
          notifyAlways: true,
          environmentId: null,
          confirmPlan: false,
        },
        steps: [
          { id: 'site_enrich', status: 'running', reason: null, progress: null },
          { id: 'plan', status: 'pending', reason: null, progress: null },
          { id: 'search_keywords', status: 'pending', reason: null, progress: null },
          { id: 'search_ad', status: 'pending', reason: null, progress: null },
        ],
        failureCode: null,
        failureMessage: null,
        startedOn: '2026-11-28T08:00:00.000Z',
        lastAdvancedOn: '2026-11-28T08:00:00.000Z',
        finishedOn: null,
        planApprovedOn: '2026-11-28T08:00:00.000Z',
        ...overrides,
      };
    }

    beforeEach(() => {
      toastMock.mockReset();
      refresh.mockReset();
      push.mockReset();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('starts search ad creation from the card, advances progress live, fires completion toast, and stops polling once done', async () => {
      const started = makeRun();
      const mid = makeRun({
        steps: [
          { id: 'site_enrich', status: 'done', reason: null, progress: null },
          { id: 'plan', status: 'done', reason: null, progress: null },
          { id: 'search_keywords', status: 'running', reason: null, progress: null },
          { id: 'search_ad', status: 'pending', reason: null, progress: null },
        ],
      });
      const done = makeRun({
        status: 'done',
        finishedOn: '2026-11-28T08:01:00.000Z',
        steps: [
          { id: 'site_enrich', status: 'done', reason: null, progress: null },
          { id: 'plan', status: 'done', reason: null, progress: null },
          { id: 'search_keywords', status: 'done', reason: null, progress: null },
          { id: 'search_ad', status: 'done', reason: null, progress: null },
        ],
      });

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ run: started }, 201))
        .mockResolvedValueOnce(jsonResponse({ run: mid }))
        .mockResolvedValueOnce(jsonResponse({ run: done }));
      vi.stubGlobal('fetch', fetchMock);

      renderWithIntl(<ReviewOverview {...PROPS} />, { locale: 'en' });
      fireEvent.click(screen.getByTestId('ad-studio-card-start-search'));

      await waitFor(() => {
        const progress = screen.getByTestId('ad-studio-card-progress-search');
        expect(progress).toHaveTextContent('Search keywords');
        expect(within(progress).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
      });
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/m/autopilot');
      expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
        options: {
          plan: true,
          images: false,
          video: false,
          search: true,
          target: 'search',
          siteEnrich: true,
          confirmPlan: false,
          notifyAlways: true,
        },
      });

      await waitFor(
        () =>
          expect(toastMock).toHaveBeenCalledWith(
            expect.objectContaining({
              variant: 'success',
              title: 'Google search ad is ready',
            }),
          ),
        { timeout: 5000 },
      );

      // Should not keep calling /advance after status becomes done.
      const totalCalls = fetchMock.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 1800));
      expect(fetchMock.mock.calls.length).toBe(totalCalls);
      expect(screen.queryByTestId('ad-studio-card-progress-search')).toBeNull();
    });

    it('starts video creation from an empty card and cancels via Stop button', async () => {
      const runningVideo = makeRun({
        id: 'run-video-1',
        options: {
          plan: true,
          images: false,
          imageFormats: ['square', 'portrait'],
          video: true,
          search: false,
          siteEnrich: true,
          target: 'video',
          targetConceptId: null,
          siteUrl: null,
          instruction: null,
          notifyAlways: true,
          environmentId: null,
          confirmPlan: false,
        },
        steps: [
          { id: 'site_enrich', status: 'done', reason: null, progress: null },
          { id: 'clips', status: 'running', reason: null, progress: { done: 1, total: 3 } },
          { id: 'assemble', status: 'pending', reason: null, progress: null },
        ],
      });
      const cancelled = { ...runningVideo, status: 'cancelled' as const };
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/m/autopilot') return jsonResponse({ run: runningVideo }, 201);
        if (url === '/m/autopilot/run-video-1/cancel') return jsonResponse({ run: cancelled });
        return jsonResponse({ run: runningVideo });
      });
      vi.stubGlobal('fetch', fetchMock);

      const emptyVideo = { ...PROPS.video, state: 'empty' as const, scenes: 0, rendered: 0, previewClipId: null };
      renderWithIntl(<ReviewOverview {...PROPS} video={emptyVideo} />, { locale: 'en' });

      fireEvent.click(screen.getByTestId('ad-studio-card-start-video'));
      await waitFor(() => expect(screen.getByTestId('ad-studio-card-progress-video')).toBeInTheDocument());

      fireEvent.click(screen.getByTestId('ad-studio-card-stop-video'));
      await waitFor(() => expect(screen.queryByTestId('ad-studio-card-progress-video')).toBeNull());
      expect(fetchMock.mock.calls.some(([url]) => url === '/m/autopilot/run-video-1/cancel')).toBe(true);
    });

    it('submits an inline AI instruction on a card and passes optional target website URL when missing', async () => {
      const reviseRun = makeRun({
        id: 'run-revise-img',
        options: {
          plan: false,
          images: true,
          imageFormats: ['square'],
          video: false,
          search: false,
          siteEnrich: true,
          target: 'image',
          targetConceptId: 'c1',
          siteUrl: 'https://acme.example',
          instruction: 'Make it warmer',
          notifyAlways: true,
          environmentId: null,
          confirmPlan: false,
        },
        steps: [{ id: 'revise', status: 'done', reason: null, progress: null }],
        status: 'done',
      });
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ run: reviseRun }, 201));
      vi.stubGlobal('fetch', fetchMock);

      renderWithIntl(<ReviewOverview {...PROPS} hasSiteUrl={false} />, { locale: 'en' });
      const siteContainer = screen.getByTestId('ad-studio-review-site-url');
      fireEvent.change(within(siteContainer).getByRole('textbox'), { target: { value: 'https://acme.example' } });

      fireEvent.click(screen.getByTestId('ad-studio-card-ai-toggle-image-1'));
      const input = screen.getByTestId('ad-studio-card-ai-input-image-1');
      fireEvent.change(input, { target: { value: 'Make it warmer' } });
      fireEvent.submit(screen.getByTestId('ad-studio-card-ai-form-image-1'));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/m/ai-revise');
      expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
        target: 'image',
        conceptId: 'c1',
        instruction: 'Make it warmer',
        siteUrl: 'https://acme.example',
      });
      expect(screen.queryByTestId('ad-studio-card-ai-form-image-1')).toBeNull();
    });

    it('displays failed run error with Try again button that restarts creation', async () => {
      const failedSearch = makeRun({
        id: 'run-failed-1',
        status: 'failed',
        failureCode: 'site_unreachable',
        steps: [{ id: 'site_enrich', status: 'failed', reason: 'site_unreachable', progress: null }],
      });
      const restarted = makeRun({ id: 'run-restarted-1', status: 'done', steps: [{ id: 'search_ad', status: 'done', reason: null, progress: null }] });
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ run: restarted }, 201));
      vi.stubGlobal('fetch', fetchMock);

      renderWithIntl(<ReviewOverview {...PROPS} initialRuns={[failedSearch]} />, { locale: 'en' });
      const alert = screen.getByTestId('ad-studio-card-error-search');
      expect(alert).toHaveTextContent('could not reach the website');

      fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/m/autopilot', expect.anything()));
    });
  });
});
