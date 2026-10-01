import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('NarrationEditor', () => {
  it('shows what the narrator reads, and saves edited words with the whole script so the server redoes the nikud', async () => {
    const saved = [{ ...SCENES[0], voiceover: `${PLAIN} ${PLAIN}`, pronunciation: `${VOCALIZED} ${VOCALIZED}` }, SCENES[1]];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ brief: { scenes: saved } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    renderWithIntl(<NarrationEditor orgId="o" projectId="p" briefId="b1" scenes={SCENES} sceneId="s1" language="he" onSaved={onSaved} />, { locale: 'he' });
    expect(screen.getByText(heMessages.AdStudio.narration.readWithNikud)).toBeInTheDocument();
    expect(screen.getByText(VOCALIZED)).toHaveAttribute('lang', 'he');

    fireEvent.click(screen.getByRole('button', { name: heMessages.AdStudio.narration.edit }));
    fireEvent.change(screen.getByLabelText(heMessages.AdStudio.narration.textLabel), { target: { value: `${PLAIN} ${PLAIN}` } });
    // The words changed under the old nikud: the person is told it is redone on save.
    expect(screen.getByText(heMessages.AdStudio.narration.nikudWillRedo)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: heMessages.AdStudio.narration.save }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/orgs/o/projects/p/ad-studio/briefs/b1/script');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body)).scenes).toEqual([{ ...SCENES[0], voiceover: `${PLAIN} ${PLAIN}` }, SCENES[1]]);
    expect(screen.getByRole('status')).toHaveTextContent(heMessages.AdStudio.narration.saved);
    expect(refresh).toHaveBeenCalled();
  });

  it('lets a person correct the nikud by hand, and says a scene without narration has none', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({ brief: { scenes: JSON.parse(String(init?.body)).scenes } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderWithIntl(<NarrationEditor orgId="o" projectId="p" briefId="b1" scenes={SCENES} sceneId="s1" language="he" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit narration' }));
    fireEvent.change(screen.getByLabelText(/^With nikud/), { target: { value: `${VOCALIZED}!` } });
    expect(screen.getByText('You can correct a vowel here; the narrator reads exactly this.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save narration' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).scenes[0].pronunciation).toBe(`${VOCALIZED}!`);
    unmount();
    renderWithIntl(<NarrationEditor orgId="o" projectId="p" briefId="b1" scenes={SCENES} sceneId="s2" language="en" />, { locale: 'en' });
    expect(screen.getByText('No narration in this scene.')).toBeInTheDocument();
  });
});
