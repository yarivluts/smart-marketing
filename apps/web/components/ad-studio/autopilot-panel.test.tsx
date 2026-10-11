import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import type { AdStudioRunView } from '@/lib/ad-studio/view';
import { AutopilotPanel } from './autopilot-panel';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const STEPS = ['plan', 'script', 'image_concepts', 'images', 'clips', 'assemble'] as const;
type StepStatus = AdStudioRunView['steps'][number]['status'];

function run(overrides: Partial<AdStudioRunView> = {}, statuses: StepStatus[] = ['pending', 'pending', 'pending', 'pending', 'pending', 'pending']): AdStudioRunView {
  return {
    id: 'r1',
    status: 'running',
    options: { plan: true, images: true, imageFormats: ['square'], video: true, environmentId: null, confirmPlan: true },
    steps: STEPS.map((id, index) => ({ id, status: statuses[index], reason: null, progress: null })),
    failureCode: null,
    failureMessage: null,
    startedOn: '2026-09-29T10:00:00.000Z',
    lastAdvancedOn: '2026-09-29T10:00:00.000Z',
    finishedOn: null,
    planApprovedOn: null,
    ...overrides,
  };
}

const HREFS = { create: '/ad?step=create', review: '/ad?step=review' };

function renderPanel(props: Partial<React.ComponentProps<typeof AutopilotPanel>> = {}, locale: 'en' | 'he' = 'en') {
  return renderWithIntl(
    <AutopilotPanel
      orgId="o"
      projectId="p"
      briefId="b1"
      initialRun={null}
      has={{ plan: false, script: false, concepts: false }}
      available={{ text: true, images: true, video: true }}
      stepHrefs={HREFS}
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
  refresh.mockReset();
  push.mockReset();
});

describe('AutopilotPanel', () => {
  it('prepares the plan with the chosen options and stops for the person to confirm it', async () => {
    const awaiting = run({ status: 'awaiting_approval' }, ['done', 'done', 'done', 'pending', 'pending', 'pending']);
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ run: run() }, 201)).mockResolvedValue(json({ run: awaiting }));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Story' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare the plan' }));

    await waitFor(() => expect(screen.getByTestId('ad-studio-confirm-plan')).toBeInTheDocument(), { timeout: 8000 });
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      options: { plan: true, images: true, video: true, imageFormats: ['square', 'portrait', 'story'] },
    });
    expect(screen.getByText('The plan is ready for your review')).toBeInTheDocument();
    // It stops asking the server to advance while it waits for the person.
    const calls = fetchMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(refresh).toHaveBeenCalled();
  }, 15000);

  it('confirms the plan and moves to the Create step', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ run: run({ planApprovedOn: '2026-09-29T10:05:00.000Z' }, ['done', 'done', 'done', 'pending', 'pending', 'pending']) })).mockResolvedValue(json({ run: run() }));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel({ initialRun: run({ status: 'awaiting_approval' }, ['done', 'done', 'done', 'pending', 'pending', 'pending']) });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm plan and create ads' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/ad?step=create'));
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/orgs/o/projects/p/ad-studio/briefs/b1/autopilot/r1/approve');
  });

  it('on the Create step, shows progress and goes to Review when everything is made', async () => {
    const done = run({ status: 'done', planApprovedOn: 'x', finishedOn: 'y' }, ['done', 'done', 'done', 'done', 'done', 'done']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ run: done })));
    renderPanel({ mode: 'progress', initialRun: run({ planApprovedOn: 'x' }, ['done', 'done', 'done', 'running', 'pending', 'pending']) });
    expect(screen.getByText('Creating your ads')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prepare the plan' })).toBeNull();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/ad?step=review'));
  });

  it('shows each step with its progress and reason, in Hebrew too', () => {
    const finished = run({ status: 'failed' }, ['skipped', 'done', 'done', 'done', 'failed', 'skipped']);
    finished.steps[0].reason = 'already_done';
    finished.steps[3].progress = { done: 3, total: 4 };
    finished.steps[4].reason = 'clip_failed';
    renderPanel({ initialRun: finished, has: { plan: true, script: true, concepts: false } });
    expect(screen.getByTestId('ad-studio-autopilot-step-plan')).toHaveTextContent('kept what you have');
    expect(screen.getByTestId('ad-studio-autopilot-step-images')).toHaveTextContent('3 of 4');
    expect(screen.getByTestId('ad-studio-autopilot-step-clips')).toHaveTextContent('a scene failed');
    expect(screen.getByRole('button', { name: 'Run the autopilot again' })).toBeEnabled();
  });

  it('cannot start with nothing to make, and warns in Hebrew when a model is not set up', () => {
    renderPanel({ available: { text: true, images: false, video: true } }, 'he');
    expect(screen.getByRole('note')).toHaveTextContent(heMessages.AdStudio.autopilot.missingModels);
    fireEvent.click(screen.getByLabelText(heMessages.AdStudio.autopilot.optionImages));
    fireEvent.click(screen.getByLabelText(heMessages.AdStudio.autopilot.optionVideo));
    expect(screen.getByRole('button', { name: heMessages.AdStudio.autopilot.prepare })).toBeDisabled();
  });
});
