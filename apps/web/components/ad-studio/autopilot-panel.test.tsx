import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import type { AdStudioRunView } from '@/lib/ad-studio/view';
import { AutopilotPanel } from './autopilot-panel';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const STEPS = ['plan', 'script', 'image_concepts', 'images', 'clips', 'assemble'] as const;

function run(overrides: Partial<AdStudioRunView> = {}, statuses: AdStudioRunView['steps'][number]['status'][] = ['pending', 'pending', 'pending', 'pending', 'pending', 'pending']): AdStudioRunView {
  return {
    id: 'r1',
    status: 'running',
    options: { plan: true, images: true, imageFormats: ['square'], video: true, environmentId: null },
    steps: STEPS.map((id, index) => ({ id, status: statuses[index], reason: null, progress: null })),
    failureCode: null,
    failureMessage: null,
    startedOn: '2026-09-28T10:00:00.000Z',
    lastAdvancedOn: '2026-09-28T10:00:00.000Z',
    finishedOn: null,
    ...overrides,
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof AutopilotPanel>> = {}) {
  return renderWithIntl(
    <AutopilotPanel
      orgId="o"
      projectId="p"
      briefId="b1"
      initialRun={null}
      has={{ plan: false, script: false, concepts: false }}
      available={{ text: true, images: true, video: true }}
      {...props}
    />,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('AutopilotPanel', () => {
  it('starts a run with the chosen options and advances it until it finishes, refreshing the page as steps complete', async () => {
    const done = run({ status: 'done', finishedOn: '2026-09-28T10:05:00.000Z' }, ['done', 'done', 'done', 'done', 'done', 'done']);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ run: run() }, 201))
      .mockResolvedValueOnce(json({ run: run({}, ['done', 'running', 'pending', 'pending', 'pending', 'pending']) }))
      .mockResolvedValue(json({ run: done }));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Story' }));
    fireEvent.click(screen.getByLabelText('Deep plan first'));
    fireEvent.click(screen.getByRole('button', { name: 'Create everything' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Finished'), { timeout: 8000 });
    const [startUrl, startInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(startUrl).toBe('/api/orgs/o/projects/p/ad-studio/briefs/b1/autopilot');
    expect(JSON.parse(startInit.body as string)).toEqual({ options: { plan: false, images: true, video: true, imageFormats: ['square', 'portrait', 'story'] } });
    expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toBe('/api/orgs/o/projects/p/ad-studio/briefs/b1/autopilot/r1/advance');
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByTestId('ad-studio-autopilot-step-assemble')).toHaveTextContent('Done');
  }, 15000);

  it('shows each step with its progress and reason, and says what it keeps', () => {
    const finished = run({ status: 'failed' }, ['skipped', 'done', 'done', 'done', 'failed', 'skipped']);
    finished.steps[0].reason = 'already_done';
    finished.steps[3].progress = { done: 3, total: 4 };
    finished.steps[4].reason = 'clip_failed';
    renderPanel({ initialRun: finished, has: { plan: true, script: true, concepts: false } });
    expect(screen.getByTestId('ad-studio-autopilot-step-plan')).toHaveTextContent('kept what you have');
    expect(screen.getByTestId('ad-studio-autopilot-step-images')).toHaveTextContent('3 of 4');
    expect(screen.getByTestId('ad-studio-autopilot-step-clips')).toHaveTextContent('a scene failed');
    expect(screen.getByText('Keeps: the plan, the script.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run again' })).toBeEnabled();
  });

  it('cannot start with nothing to make, and warns when a model is not set up', () => {
    renderPanel({ available: { text: true, images: false, video: true } });
    expect(screen.getByRole('note')).toHaveTextContent('Some of the AI models are not set up');
    fireEvent.click(screen.getByLabelText('Image ads'));
    fireEvent.click(screen.getByLabelText('Video ad'));
    expect(screen.getByRole('button', { name: 'Create everything' })).toBeDisabled();
  });
});
