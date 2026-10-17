import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { AdStudioScene } from '@growthos/shared';
import { NextIntlClientProvider } from 'next-intl';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
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

/** Re-renders keep the translations: renderWithIntl wraps only the first render. */
function intl(ui: React.ReactElement): React.ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>
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

describe('ScriptEditor pronunciation (nikud)', () => {
  // Hebrew as escapes (no Hebrew in code files): a word, and the same word with nikud.
  const plain = '\u05e9\u05dc\u05d5\u05dd';
  const vocalized = '\u05e9\u05c1\u05b8\u05dc\u05d5\u05b9\u05dd';
  const HEBREW: AdStudioScene[] = [{ id: 'a', durationSeconds: 5, visualPrompt: 'A lawyer at a desk', voiceover: plain, onScreenText: '' }];

  it('adds nikud to the narration as typed with one tap, before saving', async () => {
    const fetchMock = vi.fn(async () => json({ pronunciation: vocalized }));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor({ initialScenes: HEBREW, language: 'he' });
    const field = within(screen.getByTestId('ad-studio-pronunciation-1'));
    fireEvent.click(field.getByRole('button', { name: 'Add nikud' }));
    await waitFor(() => expect((field.getByLabelText(/Pronunciation/) as HTMLTextAreaElement).value).toBe(vocalized));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/orgs/o/projects/p/ad-studio/briefs/b1/vocalize');
    expect(JSON.parse(String(init.body))).toEqual({ text: plain });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('is offered only for Hebrew narration, says it is added on save, and shows what came back vocalized', async () => {
    const { unmount } = renderEditor();
    expect(screen.queryByTestId('ad-studio-pronunciation-1')).toBeNull();
    unmount();

    renderEditor({ initialScenes: HEBREW, language: 'he' });
    const field = within(screen.getByTestId('ad-studio-pronunciation-1'));
    expect(field.getByText(/Added automatically when you save/)).toBeInTheDocument();
    const fetchMock = vi.fn(async () => json({ brief: { scenes: [{ ...HEBREW[0], voiceover: `${plain} ${plain}`, pronunciation: `${vocalized} ${vocalized}` }] } }));
    vi.stubGlobal('fetch', fetchMock);
    fireEvent.change(within(screen.getByTestId('ad-studio-scene-1')).getByLabelText('Voiceover'), { target: { value: `${plain} ${plain}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Save script' }));
    await waitFor(() => expect((field.getByLabelText(/Pronunciation/) as HTMLTextAreaElement).value).toBe(`${vocalized} ${vocalized}`));
    expect(field.getByText(/This is what the narrator reads/)).toBeInTheDocument();
    // What was saved is what is shown: nothing is left unsaved.
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('warns that a pronunciation will be redone once the narration changes under it, and lets a person correct it', () => {
    renderEditor({ initialScenes: [{ ...HEBREW[0], pronunciation: vocalized }], language: 'he' });
    const scene = within(screen.getByTestId('ad-studio-scene-1'));
    fireEvent.change(scene.getByLabelText('Voiceover'), { target: { value: `${plain}!` } });
    expect(scene.getByText(/the pronunciation will be redone when you save/)).toBeInTheDocument();
    fireEvent.change(scene.getByLabelText(/Pronunciation/), { target: { value: `${vocalized}!` } });
    expect(scene.queryByText(/will be redone/)).toBeNull();
  });

  it('counts narration words against what fits in the scene and warns when it runs long', () => {
    renderEditor({
      initialScenes: [{ id: 'a', durationSeconds: 3, visualPrompt: 'A desk', voiceover: 'Too much paper on your desk every single day?', onScreenText: '' }],
    });
    expect(screen.getByTestId('ad-studio-voiceover-words-a')).toHaveTextContent('9/7 words');
    expect(screen.getByText(/Longer than fits in this scene/)).toBeInTheDocument();
  });

  it('keeps unsaved edits when another panel refreshes the page, and offers the saved version when it changed', () => {
    const view = renderEditor();
    const scene1 = within(screen.getByTestId('ad-studio-scene-1'));
    fireEvent.change(scene1.getByLabelText(/What the camera shows/), { target: { value: 'A lawyer signing on a phone' } });
    // A refresh sends the same saved script as a new array: the edit stays.
    view.rerender(intl(<ScriptEditor orgId="o" projectId="p" briefId="b1" initialScenes={SCENES.map((scene) => ({ ...scene }))} generatedByModel="gemini-3.8-flash" aiAvailable />));
    expect(scene1.getByLabelText(/What the camera shows/)).toHaveValue('A lawyer signing on a phone');
    expect(screen.queryByTestId('ad-studio-server-changed')).toBeNull();
    // The saved script moved on (the autopilot rewrote it): the edit still stays, with a way to load it.
    const changed = [{ ...SCENES[0], visualPrompt: 'Autopilot version' }, SCENES[1]];
    view.rerender(intl(<ScriptEditor orgId="o" projectId="p" briefId="b1" initialScenes={changed} generatedByModel="gemini-3.8-flash" aiAvailable />));
    expect(scene1.getByLabelText(/What the camera shows/)).toHaveValue('A lawyer signing on a phone');
    fireEvent.click(within(screen.getByTestId('ad-studio-server-changed')).getByRole('button'));
    expect(within(screen.getByTestId('ad-studio-scene-1')).getByLabelText(/What the camera shows/)).toHaveValue('Autopilot version');
  });

  it('says so when saving fails because the connection dropped', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    renderEditor();
    fireEvent.change(within(screen.getByTestId('ad-studio-scene-1')).getByLabelText(/What the camera shows/), { target: { value: 'Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save script' }));
    expect(await screen.findByText('GrowthOS could not finish that. Check your internet connection and try again in a moment.')).toBeInTheDocument();
  });

  it('words the generic Ad Studio failure around the connection in both languages', () => {
    for (const text of [enMessages.AdStudio.errorGeneric, heMessages.AdStudio.errorGeneric]) {
      expect(text).toContain('GrowthOS');
      expect(text).not.toMatch(/Something went wrong|משהו השתבש/);
    }
  });

  it('rewrites a scene from the scenes as they stand in the editor, unsaved ones included', async () => {
    const fetchMock = vi.fn(async () => json({ scene: { ...SCENES[0], visualPrompt: 'Proposal' } }));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    fireEvent.change(within(screen.getByTestId('ad-studio-scene-1')).getByLabelText(/What the camera shows/), { target: { value: 'Unsaved edit' } });
    fireEvent.click(within(screen.getByTestId('ad-studio-scene-1')).getByRole('button', { name: /Rewrite with AI/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Rewrite$|Suggest/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.scenes[0].visualPrompt).toBe('Unsaved edit');
  });

  it('does not overwrite a script saved elsewhere: offers the saved one, or saving on purpose', async () => {
    const saved = [{ ...SCENES[0], visualPrompt: 'Saved in another tab' }, SCENES[1]];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: 'script_conflict', brief: { scenes: saved } }, 409))
      .mockResolvedValueOnce(json({ brief: { scenes: [{ ...SCENES[0], visualPrompt: 'Mine' }, SCENES[1]] } }));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    fireEvent.change(within(screen.getByTestId('ad-studio-scene-1')).getByLabelText(/What the camera shows/), { target: { value: 'Mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save script' }));
    expect(await screen.findByTestId('ad-studio-script-conflict')).toBeInTheDocument();
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).base).toEqual(SCENES);
    fireEvent.click(screen.getByRole('button', { name: 'Save mine anyway' }));
    await waitFor(() => expect(screen.queryByTestId('ad-studio-script-conflict')).toBeNull());
    expect(JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body)).base).toBeUndefined();
  });
});
