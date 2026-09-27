import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { AdStudioScene } from '@growthos/shared';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { ScriptEditor } from './script-editor';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const SCENES: AdStudioScene[] = [
  { id: 'a', durationSeconds: 5, visualPrompt: 'A lawyer at a desk', voiceover: 'Too much paper?', onScreenText: '' },
  { id: 'b', durationSeconds: 8, visualPrompt: 'A phone showing a signature', voiceover: '', onScreenText: 'Signed in 30s' },
];

function renderEditor(props: Partial<React.ComponentProps<typeof ScriptEditor>> = {}) {
  return renderWithIntl(
    <ScriptEditor orgId="o" projectId="p" briefId="b1" initialScenes={SCENES} generatedByModel="gemini-3.8-flash" aiAvailable {...props} />,
    { locale: 'en' },
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('ScriptEditor', () => {
  it('shows the script on the one-minute ruler and who wrote it', () => {
    renderEditor();
    expect(screen.getByText('13s of 60s')).toBeInTheDocument();
    expect(screen.getByText('Written by gemini-3.8-flash')).toBeInTheDocument();
    expect(screen.getByTestId('ad-studio-scene-2')).toHaveTextContent('Scene 2');
  });

  it('checks the rules live: an emptied visual prompt is flagged and the save button stays disabled', () => {
    renderEditor();
    const scene1 = within(screen.getByTestId('ad-studio-scene-1'));
    fireEvent.change(scene1.getByLabelText(/What the camera shows/), { target: { value: '' } });
    expect(scene1.getByText('Scene 1 needs a description of what the camera shows.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save script' })).toBeDisabled();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByText('Edited by you')).toBeInTheDocument();
  });

  it('saves an edited, legal script with the whole scene list', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => json({ brief: { scenes: JSON.parse(String(init?.body)).scenes } }));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    fireEvent.change(within(screen.getByTestId('ad-studio-scene-2')).getByLabelText('On-screen text'), { target: { value: 'Signed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save script' }));
    await waitFor(() => expect(screen.getByText('Script saved.')).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/orgs/o/projects/p/ad-studio/briefs/b1/script');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body)).scenes[1].onScreenText).toBe('Signed');
  });

  it('asks before an AI draft replaces an existing script', async () => {
    const fetchMock = vi.fn(async () => json({ brief: { scenes: [{ id: 'n', durationSeconds: 6, visualPrompt: 'New shot', voiceover: '', onScreenText: '' }] } }));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Write script with AI' }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    await waitFor(() => expect(screen.getByText('6s of 60s')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/orgs/o/projects/p/ad-studio/briefs/b1/script/generate', { method: 'POST' });
  });

  it('a scene rewrite is shown as a proposal first; "Use this" puts it in place', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ scene: { id: 'a', durationSeconds: 5, visualPrompt: 'An energetic lawyer', voiceover: 'Done!', onScreenText: '' } })));
    renderEditor();
    const scene1 = within(screen.getByTestId('ad-studio-scene-1'));
    fireEvent.click(scene1.getByRole('button', { name: 'Rewrite with AI' }));
    fireEvent.change(scene1.getByPlaceholderText(/more energy/), { target: { value: 'more energy' } });
    fireEvent.click(scene1.getByRole('button', { name: 'Rewrite' }));
    await waitFor(() => expect(scene1.getByTestId('ad-studio-proposal')).toHaveTextContent('An energetic lawyer'));
    expect((scene1.getByLabelText(/What the camera shows/) as HTMLTextAreaElement).value).toBe('A lawyer at a desk');
    fireEvent.click(scene1.getByRole('button', { name: 'Use this' }));
    expect((scene1.getByLabelText(/What the camera shows/) as HTMLTextAreaElement).value).toBe('An energetic lawyer');
  });

  it('turns a provider error into a sentence, and disables AI actions when no provider is configured', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'quota_exceeded', limitKind: 'text', used: 50, limit: 50 }, 429)));
    const { unmount } = renderEditor({ initialScenes: [] });
    expect(screen.getByText('No script yet. Write one with AI, or add scenes by hand.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Write script with AI' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Today's limit is reached (50 of 50)"));
    unmount();
    renderEditor({ aiAvailable: false });
    expect(screen.getByRole('button', { name: 'Write script with AI' })).toBeDisabled();
  });

  it('adds, reorders and removes scenes', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }));
    expect(screen.getByText('18s of 60s')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('ad-studio-scene-2')).getByRole('button', { name: 'Move scene up' }));
    expect((within(screen.getByTestId('ad-studio-scene-1')).getByLabelText(/What the camera shows/) as HTMLTextAreaElement).value).toBe('A phone showing a signature');
    fireEvent.click(within(screen.getByTestId('ad-studio-scene-3')).getByRole('button', { name: 'Remove scene' }));
    expect(screen.getByText('13s of 60s')).toBeInTheDocument();
  });
});
