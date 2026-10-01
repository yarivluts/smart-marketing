import { describe, expect, it } from 'vitest';
import type { AdStudioScene } from './scenes';
import { buildScenePrompt, sceneFingerprint } from './video';
import { DEFAULT_AD_STUDIO_VIDEO_SETTINGS, isDefaultVideoSettings, normalizeVideoSettings, videoSettingsIssue } from './video-settings';

const CONTEXT = { format: 'vertical' as const, language: 'en', productDescription: 'E-signatures for lawyers', voice: null, settings: null };

function scene(overrides: Partial<AdStudioScene> = {}): AdStudioScene {
  return { id: 's1', durationSeconds: 5, visualPrompt: 'Two lawyers at a desk', voiceover: 'Sign in seconds.', onScreenText: '', ...overrides };
}

describe('advanced video settings', () => {
  it('fills missing or unknown values with the defaults and keeps custom music only with a description', () => {
    expect(normalizeVideoSettings(null)).toEqual(DEFAULT_AD_STUDIO_VIDEO_SETTINGS);
    expect(normalizeVideoSettings({ resolution: '4k' as never, style: 'cinematic' })).toEqual({ resolution: '720p', style: 'cinematic', music: 'auto' });
    expect(normalizeVideoSettings({ music: 'custom', musicDescription: '  ' })).toMatchObject({ music: 'auto' });
    expect(normalizeVideoSettings({ music: 'none', musicDescription: 'drums', avoid: '  no   cars ' })).toEqual({ resolution: '720p', style: 'commercial', music: 'none', avoid: 'no cars' });
  });

  it('refuses unknown values and over-long text, and needs a description for custom music', () => {
    expect(videoSettingsIssue({ resolution: '1080p', style: 'ugc_phone', music: 'none' })).toBeNull();
    expect(videoSettingsIssue({ resolution: '4k' as never })).toBe('unknown_resolution');
    expect(videoSettingsIssue({ style: 'noir' as never })).toBe('unknown_style');
    expect(videoSettingsIssue({ music: 'loud' as never })).toBe('unknown_music');
    expect(videoSettingsIssue({ music: 'custom' })).toBe('music_description_required');
    expect(videoSettingsIssue({ music: 'custom', musicDescription: 'x'.repeat(201) })).toBe('music_description_too_long');
    expect(videoSettingsIssue({ avoid: 'x'.repeat(301) })).toBe('avoid_too_long');
  });

  it('writes the style, the music and what to avoid into every scene prompt', () => {
    const settings = { resolution: '1080p' as const, style: 'ugc_phone' as const, music: 'custom' as const, musicDescription: 'upbeat acoustic guitar', avoid: 'animals, cars' };
    const narrated = buildScenePrompt(scene(), { ...CONTEXT, settings });
    expect(narrated).toContain('authentic, handheld smartphone look of a real customer video');
    expect(narrated).not.toContain('polished commercial style');
    expect(narrated).toContain('Background music: upbeat acoustic guitar, softly under the voice - the same music in every scene.');
    expect(narrated).not.toContain('Soft background music under the voice.');
    expect(narrated).toContain('Never show any of these anywhere in the video: animals, cars.');
    const silent = buildScenePrompt(scene({ voiceover: '' }), { ...CONTEXT, settings: { ...settings, music: 'none' } });
    expect(silent).toContain('Audio: natural ambient sound that fits the shot. No music. No speech.');
    // The on-screen speaker gets the same music line.
    expect(buildScenePrompt(scene({ delivery: 'on_screen' }), { ...CONTEXT, settings: { ...settings, music: 'none' } })).toContain('There is no off-screen narrator. No music - only the voice and natural ambient sound.');
  });

  it('keeps every earlier prompt and fingerprint with the defaults, and makes clips out of date once a setting changes', () => {
    const defaults = { ...CONTEXT, settings: DEFAULT_AD_STUDIO_VIDEO_SETTINGS };
    expect(isDefaultVideoSettings(DEFAULT_AD_STUDIO_VIDEO_SETTINGS)).toBe(true);
    expect(buildScenePrompt(scene(), defaults)).toBe(buildScenePrompt(scene(), CONTEXT));
    expect(sceneFingerprint(scene(), defaults)).toBe(sceneFingerprint(scene(), CONTEXT));
    const before = sceneFingerprint(scene(), CONTEXT);
    expect(sceneFingerprint(scene(), { ...CONTEXT, settings: { ...DEFAULT_AD_STUDIO_VIDEO_SETTINGS, resolution: '1080p' } })).not.toBe(before);
    expect(sceneFingerprint(scene(), { ...CONTEXT, settings: { ...DEFAULT_AD_STUDIO_VIDEO_SETTINGS, avoid: 'cars' } })).not.toBe(before);
  });
});
