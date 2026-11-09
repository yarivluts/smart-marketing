import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { NarrationModePicker } from './narration-mode-picker';

const BASE = '/api/orgs/o/projects/p/ad-studio/briefs/b1';
const en = enMessages.AdStudio.narrationMode;
const he = heMessages.AdStudio.narrationMode;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('NarrationModePicker', () => {
  it('starts on automatic, says what it resolved to, and saves voice-over for the whole ad', async () => {
    const scenes = [{ id: 's1', durationSeconds: 5, visualPrompt: 'A desk', voiceover: 'Hi', onScreenText: '' }];
    const fetchMock = vi.fn(async () => json({ brief: { narrationMode: 'voiceover', scenes } }));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    renderWithIntl(<NarrationModePicker base={BASE} mode={null} effective="on_camera" presenter="" onSaved={onSaved} />, { locale: 'en' });
    expect(screen.getByRole('radio', { name: en.modes.auto })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('ad-studio-narration-explain')).toHaveTextContent(en.modes.on_camera);
    expect(screen.getByRole('button', { name: en.save })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: en.modes.voiceover }));
    expect(screen.getByTestId('ad-studio-narration-explain')).toHaveTextContent(en.explain.voiceover);
    fireEvent.click(screen.getByRole('button', { name: en.save }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ mode: 'voiceover', scenes }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/narration`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ mode: 'voiceover' });
    expect(screen.getByRole('status')).toHaveTextContent(en.saved);
  });

  it('asks who the presenter is on camera, sends it, and can go back to automatic (in Hebrew)', async () => {
    const fetchMock = vi.fn(async () => json({ brief: { narrationMode: 'on_camera', scenes: [] } }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<NarrationModePicker base={BASE} mode="on_camera" effective="on_camera" presenter="the founder" onSaved={vi.fn()} />, { locale: 'he' });
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('the founder');
    expect(screen.getByRole('button', { name: he.save })).toBeDisabled();
    fireEvent.change(input, { target: { value: ' a chef ' } });
    fireEvent.click(screen.getByRole('button', { name: he.save }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ mode: 'on_camera', presenter: 'a chef' });

    fireEvent.click(screen.getByRole('radio', { name: he.modes.auto }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: he.save }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toEqual({ mode: null });
  });

  it('shows the route error in words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'invalid_request' }, 400)));
    renderWithIntl(<NarrationModePicker base={BASE} mode={null} effective="voiceover" presenter="" onSaved={vi.fn()} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('radio', { name: en.modes.mixed }));
    fireEvent.click(screen.getByRole('button', { name: en.save }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveClass('text-destructive'));
  });
});
