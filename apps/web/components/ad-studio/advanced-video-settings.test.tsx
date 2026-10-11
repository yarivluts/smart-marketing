import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { AdvancedVideoSettings } from './advanced-video-settings';

const BASE = '/api/orgs/o/projects/p/ad-studio/briefs/b1';
const en = enMessages.AdStudio.advanced;
const he = heMessages.AdStudio.advanced;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('AdvancedVideoSettings', () => {
  it('opens from its button, starts on the defaults and saves the chosen resolution, style, music and exclusions', async () => {
    const saved = {
      resolution: '1080p',
      style: 'ugc_phone',
      music: 'custom',
      musicDescription: 'upbeat guitar',
      avoid: 'cars',
    };
    const fetchMock = vi.fn(async () => json({ brief: { videoSettings: saved } }));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    renderWithIntl(<AdvancedVideoSettings base={BASE} settings={null} onSaved={onSaved} />, {
      locale: 'en',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.open }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: en.resolution['720p'] })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('button', { name: en.save })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: en.resolution['1080p'] }));
    fireEvent.click(screen.getByRole('radio', { name: en.style.ugc_phone }));
    fireEvent.click(screen.getByRole('radio', { name: en.music.custom }));
    // Custom music needs words first.
    expect(screen.getByRole('button', { name: en.save })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(en.musicDescriptionPlaceholder), {
      target: { value: 'upbeat guitar' },
    });
    fireEvent.change(screen.getByPlaceholderText(en.avoidPlaceholder), {
      target: { value: 'cars' },
    });
    fireEvent.click(screen.getByRole('button', { name: en.save }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/video-settings`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ settings: saved });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks changed settings, and back to defaults clears the exclusions explicitly', async () => {
    const fetchMock = vi.fn(async () => json({ brief: { videoSettings: null } }));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    renderWithIntl(
      <AdvancedVideoSettings
        base={BASE}
        settings={{ resolution: '720p', style: 'cinematic', music: 'none', avoid: 'cars' }}
        onSaved={onSaved}
      />,
      { locale: 'he' },
    );
    expect(screen.getByText(he.changed)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(he.open) }));
    fireEvent.click(screen.getByRole('button', { name: he.reset }));
    fireEvent.click(screen.getByRole('button', { name: he.save }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null));
    expect(
      JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)),
    ).toEqual({
      settings: {
        resolution: '720p',
        style: 'commercial',
        music: 'auto',
        musicDescription: '',
        avoid: '',
      },
    });
  });

  it('keeps the dialog open with the error in words when the save is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: 'invalid_video_settings', code: 'avoid_too_long' }, 400)),
    );
    renderWithIntl(<AdvancedVideoSettings base={BASE} settings={null} onSaved={vi.fn()} />, {
      locale: 'en',
    });
    fireEvent.click(screen.getByRole('button', { name: en.open }));
    fireEvent.click(screen.getByRole('radio', { name: en.style.cinematic }));
    fireEvent.click(screen.getByRole('button', { name: en.save }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(en.errors.avoid_too_long),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
