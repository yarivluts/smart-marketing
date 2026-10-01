import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { AdStudioScene } from '@growthos/shared';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import { NarrationEditor } from './narration-editor';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

// Hebrew as escapes (no Hebrew in code files).
const PLAIN = '\u05e9\u05dc\u05d5\u05dd';
const VOCALIZED = '\u05e9\u05c1\u05b8\u05dc\u05d5\u05b9\u05dd';
const SCENES: AdStudioScene[] = [
  { id: 's1', durationSeconds: 5, visualPrompt: 'A desk', voiceover: PLAIN, pronunciation: VOCALIZED, onScreenText: '' },
  { id: 's2', durationSeconds: 5, visualPrompt: 'A phone', voiceover: '', onScreenText: '' },
];
const BASE = '/api/orgs/o/projects/p/ad-studio/briefs/b1';
const he = heMessages.AdStudio.narration;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderEditor(props: Partial<React.ComponentProps<typeof NarrationEditor>> = {}, locale: 'en' | 'he' = 'he') {
  return renderWithIntl(<NarrationEditor orgId="o" projectId="p" briefId="b1" scenes={SCENES} sceneId="s1" language="he" {...props} />, { locale });
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('NarrationEditor', () => {
  it('shows what the camera shows and what the narrator reads, and saves edited words and description with the whole script', async () => {
    const saved = [{ ...SCENES[0], visualPrompt: 'A desk at night', voiceover: `${PLAIN} ${PLAIN}`, pronunciation: `${VOCALIZED} ${VOCALIZED}` }, SCENES[1]];
    const fetchMock = vi.fn(async () => json({ brief: { scenes: saved } }));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    renderEditor({ onSaved });
    expect(screen.getByText('A desk')).toBeInTheDocument();
    expect(screen.getByText(he.readWithNikud)).toBeInTheDocument();
    expect(screen.getByText(VOCALIZED)).toHaveAttribute('lang', 'he');

    fireEvent.click(screen.getByRole('button', { name: he.edit }));
    fireEvent.change(screen.getByLabelText(new RegExp(`^${he.sceneLabel}`)), { target: { value: 'A desk at night' } });
    fireEvent.change(screen.getByLabelText(he.textLabel), { target: { value: `${PLAIN} ${PLAIN}` } });
    // The words changed under the old nikud: the person is told it is redone on save.
    expect(screen.getByText(he.nikudWillRedo)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: he.save }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/script`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body)).scenes).toEqual([{ ...SCENES[0], visualPrompt: 'A desk at night', voiceover: `${PLAIN} ${PLAIN}` }, SCENES[1]]);
    expect(screen.getByRole('status')).toHaveTextContent(he.saved);
    expect(refresh).toHaveBeenCalled();
  });

  it('adds nikud to the typed words on request, so a vowel can be fixed before saving', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith('/vocalize') ? json({ pronunciation: `${VOCALIZED}!` }) : json({ brief: { scenes: JSON.parse(String(init?.body)).scenes } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderEditor({}, 'en');
    fireEvent.click(screen.getByRole('button', { name: 'Edit the scene' }));
    fireEvent.change(screen.getByLabelText('Narration'), { target: { value: `${PLAIN}!` } });
    fireEvent.click(screen.getByRole('button', { name: 'Add nikud' }));
    await waitFor(() => expect((screen.getByLabelText('With nikud (what the narrator reads)') as HTMLTextAreaElement).value).toBe(`${VOCALIZED}!`));
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`${BASE}/vocalize`);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ text: `${PLAIN}!` });
    // Fresh nikud for the new words: no "will be redone" warning, and it is what gets saved.
    expect(screen.getByText('You can correct a vowel here; the narrator reads exactly this.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save narration' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body)).scenes[0]).toMatchObject({ voiceover: `${PLAIN}!`, pronunciation: `${VOCALIZED}!` });
  });

  it('shows an AI suggestion that changes nothing until it is used, and can be discarded', async () => {
    const proposal = { ...SCENES[0], visualPrompt: 'A lawyer smiles at a phone', voiceover: `${PLAIN} ${PLAIN}` };
    const fetchMock = vi.fn(async () => json({ scene: proposal }));
    vi.stubGlobal('fetch', fetchMock);
    renderEditor({}, 'en');
    fireEvent.click(screen.getByRole('button', { name: 'AI suggestion' }));
    const panel = within(screen.getByTestId('ad-studio-scene-suggestion'));
    fireEvent.change(panel.getByLabelText(/What should change/), { target: { value: 'more energy' } });
    fireEvent.click(panel.getByRole('button', { name: 'Suggest' }));
    const shown = within(await screen.findByTestId('ad-studio-scene-proposal'));
    expect(shown.getByText('A lawyer smiles at a phone')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/scenes/s1/rewrite`);
    expect(JSON.parse(String(init.body))).toEqual({ instruction: 'more energy' });
    // Nothing in the editor has changed yet.
    expect((screen.getByLabelText(/^What the camera shows/) as HTMLTextAreaElement).value).toBe('A desk');

    fireEvent.click(shown.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByTestId('ad-studio-scene-proposal')).toBeNull();
    fireEvent.click(panel.getByRole('button', { name: 'Suggest' }));
    fireEvent.click(within(await screen.findByTestId('ad-studio-scene-proposal')).getByRole('button', { name: 'Use the suggestion' }));
    expect((screen.getByLabelText(/^What the camera shows/) as HTMLTextAreaElement).value).toBe('A lawyer smiles at a phone');
    expect((screen.getByLabelText('Narration') as HTMLTextAreaElement).value).toBe(`${PLAIN} ${PLAIN}`);
    // New words: the old nikud is cleared, so it is added again (by the button or on save).
    expect((screen.getByLabelText('With nikud (what the narrator reads)') as HTMLTextAreaElement).value).toBe('');
  });

  it('says a scene without narration has none', () => {
    renderEditor({ sceneId: 's2', language: 'en' }, 'en');
    expect(screen.getByText('No narration in this scene.')).toBeInTheDocument();
  });
});
