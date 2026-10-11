import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { VoicePicker } from './voice-picker';
import { SpeakerBadge, SpeakerControl } from './speaker-control';

const BASE = '/api/orgs/o/projects/p/ad-studio/briefs/b1';
const en = enMessages.AdStudio.voice;
const he = heMessages.AdStudio.voice;
const speakerEn = enMessages.AdStudio.speaker;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('VoicePicker', () => {
  it('starts on the saved voice and saves a preset for the whole ad', async () => {
    const fetchMock = vi.fn(async () => json({ brief: { voice: { preset: 'man_deep' } } }));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    renderWithIntl(<VoicePicker base={BASE} voice={null} onSaved={onSaved} />, { locale: 'en' });
    expect(screen.getByRole('radio', { name: en.presets.auto })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Nothing changed yet: nothing to save.
    expect(screen.getByRole('button', { name: en.save })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: en.presets.man_deep }));
    fireEvent.click(screen.getByRole('button', { name: en.save }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ preset: 'man_deep' }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/voice`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ voice: { preset: 'man_deep' } });
    expect(screen.getByRole('status')).toHaveTextContent(en.saved);
  });

  it('needs a description for a custom voice, and clears the voice back to automatic', async () => {
    const fetchMock = vi.fn(async () => json({ brief: { voice: null } }));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    renderWithIntl(<VoicePicker base={BASE} voice={{ preset: 'woman_warm' }} onSaved={onSaved} />, {
      locale: 'he',
    });
    fireEvent.click(screen.getByRole('radio', { name: he.presets.custom }));
    expect(screen.getByRole('button', { name: he.save })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'an older man' } });
    expect(screen.getByRole('button', { name: he.save })).toBeEnabled();

    fireEvent.click(screen.getByRole('radio', { name: he.presets.auto }));
    fireEvent.click(screen.getByRole('button', { name: he.save }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null));
    expect(
      JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)),
    ).toEqual({ voice: null });
  });

  it('shows the route error in words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: 'invalid_voice', code: 'voice_description_too_long' }, 400)),
    );
    renderWithIntl(<VoicePicker base={BASE} voice={null} onSaved={vi.fn()} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('radio', { name: en.presets.woman_warm }));
    fireEvent.click(screen.getByRole('button', { name: en.save }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(en.errors.voice_description_too_long),
    );
  });
});

describe('SpeakerControl', () => {
  it('switches a scene to a person on screen and asks which one speaks', () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = React.useState<{
        delivery: 'voiceover' | 'on_screen';
        speaker: string;
      }>({ delivery: 'voiceover', speaker: '' });
      return (
        <SpeakerControl
          {...value}
          idPrefix="s1"
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }
    renderWithIntl(<Harness />, { locale: 'en' });
    expect(screen.getByText(speakerEn.voiceoverHint)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: speakerEn.on_screen }));
    expect(onChange).toHaveBeenCalledWith({ delivery: 'on_screen', speaker: '' });
    expect(screen.queryByText(speakerEn.voiceoverHint)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'the lawyer' } });
    expect(onChange).toHaveBeenLastCalledWith({ delivery: 'on_screen', speaker: 'the lawyer' });
  });

  it('says who speaks in one line', () => {
    renderWithIntl(
      <>
        <SpeakerBadge />
        <SpeakerBadge delivery="on_screen" />
        <SpeakerBadge delivery="on_screen" speaker=" the lawyer " />
      </>,
      { locale: 'en' },
    );
    const badges = screen
      .getAllByTestId('ad-studio-speaker-badge')
      .map((badge) => badge.textContent);
    expect(badges).toEqual([
      speakerEn.badgeVoiceover,
      speakerEn.badgeOnScreenAny,
      'Spoken on screen by the lawyer',
    ]);
  });
});
