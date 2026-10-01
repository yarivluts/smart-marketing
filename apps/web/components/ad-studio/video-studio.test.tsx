import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { sceneFingerprint, type AdStudioScene } from '@growthos/shared';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import type { AdStudioClipView, AdStudioVideoView } from '@/lib/ad-studio/view';
import heMessages from '@/messages/he.json';
import { VideoStudio } from './video-studio';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const SCENES: AdStudioScene[] = [
  { id: 'a', durationSeconds: 5, visualPrompt: 'A lawyer at a desk', voiceover: '', onScreenText: '' },
  { id: 'b', durationSeconds: 8, visualPrompt: 'A phone showing a signature', voiceover: '', onScreenText: '' },
];
const CONTEXT = { format: 'vertical' as const, language: 'en', voice: null };
const fp = (index: number) => sceneFingerprint(SCENES[index], CONTEXT);
const BASE = '/api/orgs/o/projects/p/ad-studio/briefs/b1';

function clip(id: string, sceneId: string, version: number, status: AdStudioClipView['status'], fingerprint: string, extra: Partial<AdStudioClipView> = {}): AdStudioClipView {
  return {
    id,
    sceneId,
    version,
    kind: 'render',
    status,
    failureReason: null,
    sceneFingerprint: fingerprint,
    durationSeconds: 5,
    parentClipId: null,
    instruction: null,
    requestedOn: '2026-09-27T10:00:00.000Z',
    completedOn: null,
    qa: null,
    ...extra,
  };
}

function renderStudio(props: Partial<React.ComponentProps<typeof VideoStudio>> = {}, locale: 'en' | 'he' = 'en') {
  return renderWithIntl(
    <VideoStudio
      orgId="o"
      projectId="p"
      briefId="b1"
      scenes={SCENES}
      format="vertical"
      language="en"
      initialClips={[]}
      initialVideos={[]}
      videoAvailable
      videoSecondsLeft={300}
      {...props}
    />,
    { locale },
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  refresh.mockReset();
});

describe('VideoStudio', () => {
  it('shows progress on the ruler, the render-all cost against what is left today, and asks to render every scene', () => {
    renderStudio({ initialClips: [clip('c1', 'a', 1, 'ready', fp(0))], videoSecondsLeft: 20 });
    expect(screen.getByTestId('ad-studio-video-progress')).toHaveTextContent('1 of 2 scenes rendered');
    expect(screen.getByRole('button', { name: 'Render all scenes (8s)' })).toBeEnabled();
    expect(screen.getByTestId('ad-studio-render-all-cost')).toHaveTextContent('Uses 8s of the 20s of video left today.');
    const scene1 = within(screen.getByTestId('ad-studio-video-scene-1'));
    expect(scene1.getByTestId('ad-studio-clip-player')).toHaveAttribute('src', `${BASE}/clips/c1/media`);
    expect(scene1.getByTestId('ad-studio-scene-video-state')).toHaveTextContent('Ready');
    expect(within(screen.getByTestId('ad-studio-video-scene-2')).getByText('Not rendered yet.')).toBeInTheDocument();
    expect(screen.getByText(/On-screen text is not drawn into the video/)).toBeInTheDocument();
  });

  it('refuses render-all over the daily limit and says why', () => {
    renderStudio({ videoSecondsLeft: 6 });
    expect(screen.getByRole('button', { name: 'Render all scenes (13s)' })).toBeDisabled();
    expect(screen.getByTestId('ad-studio-render-all-cost')).toHaveTextContent('Needs 13s of video, but only 6s are left today.');
    expect(within(screen.getByTestId('ad-studio-video-scene-2')).getByRole('button', { name: 'Render (8s)' })).toBeDisabled();
  });

  it('marks a clip made from an older version of the scene as out of date', () => {
    renderStudio({ initialClips: [clip('c1', 'a', 1, 'ready', 'an-older-fingerprint')] });
    const scene1 = within(screen.getByTestId('ad-studio-video-scene-1'));
    expect(scene1.getByTestId('ad-studio-scene-video-state')).toHaveTextContent('Out of date');
    expect(scene1.getByTestId('ad-studio-out-of-date-badge')).toHaveTextContent('Out of date');
    expect(scene1.getByRole('button', { name: 'Re-render (5s)' })).toBeEnabled();
  });

  it('starts a render, then polls the status route while it generates until the clip is ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const generating = clip('c1', 'a', 1, 'generating', fp(0));
    const fetchMock = vi.fn(async (url: string) => {
      if (url === `${BASE}/scenes/a/render`) return json({ clips: [generating], videos: [] });
      if (url === `${BASE}/render-status`) return json({ clips: [{ ...generating, status: 'ready' }], videos: [] });
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderStudio();
    const scene1 = within(screen.getByTestId('ad-studio-video-scene-1'));
    fireEvent.click(scene1.getByRole('button', { name: 'Render (5s)' }));
    await waitFor(() => expect(scene1.getByRole('status')).toHaveTextContent('Generating'));
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/scenes/a/render`, { method: 'POST' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    await waitFor(() => expect(scene1.getByTestId('ad-studio-scene-video-state')).toHaveTextContent('Ready'));
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/render-status`, { cache: 'no-store' });
    expect(refresh).toHaveBeenCalled();
  });

  it('turns a billing refusal into a sentence and shows the failed clip with its reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/render-status')
          ? json({ clips: [clip('c1', 'b', 1, 'failed', fp(1), { failureReason: 'provider_billing' })], videos: [] })
          : json({ error: 'provider_failed', code: 'provider_billing' }, 502),
      ),
    );
    renderStudio();
    fireEvent.click(within(screen.getByTestId('ad-studio-video-scene-2')).getByRole('button', { name: 'Render (8s)' }));
    await waitFor(() => expect(screen.getByTestId('ad-studio-video-message')).toHaveTextContent('The AI provider refused for billing'));
    expect(within(screen.getByTestId('ad-studio-video-scene-2')).getByTestId('ad-studio-clip-failure')).toHaveTextContent('Failed: the Gemini account is out of credit');
  });

  it('edits a finished clip by instruction and lists versions newest first', async () => {
    const fetchMock = vi.fn(async () => json({ clips: [clip('c1', 'a', 1, 'ready', fp(0)), clip('c2', 'a', 2, 'generating', fp(0), { kind: 'edit', instruction: 'make it night' })], videos: [] }));
    vi.stubGlobal('fetch', fetchMock);
    renderStudio({ initialClips: [clip('c1', 'a', 1, 'ready', fp(0))] });
    const scene1 = within(screen.getByTestId('ad-studio-video-scene-1'));
    fireEvent.change(scene1.getByPlaceholderText(/make it night/), { target: { value: 'make it night' } });
    fireEvent.click(scene1.getByRole('button', { name: 'Edit video' }));
    await waitFor(() => expect(scene1.getByTestId('ad-studio-versions')).toHaveTextContent('2 versions'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/scenes/a/edit`);
    expect(JSON.parse(String(init.body))).toEqual({ instruction: 'make it night' });
    const versions = scene1.getAllByText(/^Version \d$/).map((node) => node.textContent);
    expect(versions).toEqual(['Version 2', 'Version 1']);
    expect(scene1.getByText('Edit: make it night')).toBeInTheDocument();
  });

  it('assembles once every scene has a current clip and shows the finished player with its length', async () => {
    const clips = [clip('c1', 'a', 1, 'ready', fp(0)), clip('c2', 'b', 1, 'ready', fp(1))];
    const video: AdStudioVideoView = { id: 'v1', status: 'ready', failureReason: null, clipIds: ['c1', 'c2'], durationSeconds: 12.97, requestedOn: '2026-09-27T10:00:00.000Z', assembledOn: '2026-09-27T10:01:00.000Z' };
    const fetchMock = vi.fn(async () => json({ video, clips, videos: [video] }));
    vi.stubGlobal('fetch', fetchMock);
    renderStudio({ initialClips: clips });
    expect(screen.getByText('No assembled video yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Assemble video' }));
    await waitFor(() => expect(screen.getByTestId('ad-studio-final-player')).toHaveAttribute('src', `${BASE}/videos/v1/media`));
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/assemble`, { method: 'POST' });
    expect(screen.getByTestId('ad-studio-final-meta')).toHaveTextContent('13s · assembled');
    expect(screen.queryByText(/Assemble again to include them/)).not.toBeInTheDocument();
  });

  it('keeps assembly off until every scene is ready, and says an older video is out of date', () => {
    const video: AdStudioVideoView = { id: 'v1', status: 'ready', failureReason: null, clipIds: ['old1', 'old2'], durationSeconds: 13, requestedOn: '2026-09-27T09:00:00.000Z', assembledOn: '2026-09-27T09:01:00.000Z' };
    renderStudio({ initialClips: [clip('c1', 'a', 1, 'ready', fp(0))], initialVideos: [video] });
    expect(screen.getByRole('button', { name: 'Assemble video' })).toBeDisabled();
    expect(screen.getByText(/Every scene needs a ready, current clip/)).toBeInTheDocument();
    expect(screen.getByText(/Assemble again to include them/)).toBeInTheDocument();
  });

  it('asks for a saved script first, disables generation without a video model, and renders in Hebrew', () => {
    const { unmount } = renderStudio({ scenes: [] });
    expect(screen.getByText(/Save a script first/)).toBeInTheDocument();
    unmount();
    const second = renderStudio({ videoAvailable: false });
    expect(screen.getByText(/No video model is configured/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Render all scenes (13s)' })).toBeDisabled();
    second.unmount();
    renderStudio({}, 'he');
    expect(screen.getByTestId('ad-studio-video-progress')).toHaveTextContent(heMessages.AdStudio.video.progress.replace('{rendered}', '0').replace('{total}', '2'));
  });
});

describe('VideoStudio narration and the phone layout', () => {
  // Hebrew as escapes (no Hebrew in code files): a word, and the same word with nikud.
  const plain = '\u05e9\u05dc\u05d5\u05dd';
  const vocalized = '\u05e9\u05c1\u05b8\u05dc\u05d5\u05b9\u05dd';

  it('shows what the narrator reads, with nikud once it is there, and says nikud is added on render until then', () => {
    const scenes: AdStudioScene[] = [
      { ...SCENES[0], voiceover: plain, pronunciation: vocalized },
      { ...SCENES[1], voiceover: plain },
    ];
    renderStudio({ scenes, language: 'he' }, 'he');
    const [first, second] = screen.getAllByTestId('ad-studio-scene-narration');
    expect(first).toHaveTextContent(heMessages.AdStudio.narration.readWithNikud);
    expect(within(first).getByText(vocalized)).toHaveAttribute('lang', 'he');
    expect(second).toHaveTextContent(heMessages.AdStudio.narration.label);
    expect(second).toHaveTextContent(heMessages.AdStudio.narration.willVocalize);
  });

  it('is an accordion on phones: the first scene open, the others one header line until tapped', () => {
    renderStudio();
    const first = screen.getByTestId('ad-studio-video-scene-1');
    const second = screen.getByTestId('ad-studio-video-scene-2');
    expect(first).toHaveAttribute('data-open', 'true');
    expect(second).toHaveAttribute('data-open', 'false');
    const toggle = screen.getByTestId('ad-studio-video-scene-2-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed bodies are hidden below the md breakpoint only; desktop always shows them.
    expect(document.getElementById(toggle.getAttribute('aria-controls') as string)).toHaveClass('max-md:hidden');
    fireEvent.click(toggle);
    expect(second).toHaveAttribute('data-open', 'true');
    expect(document.getElementById(toggle.getAttribute('aria-controls') as string)).not.toHaveClass('max-md:hidden');
  });
});
