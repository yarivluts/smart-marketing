import { describe, expect, it, vi } from 'vitest';
import { AD_STUDIO_QA_VIDEO_FPS, AdStudioClipQaSchema, buildClipQaPrompt } from './qa';
import { createGeminiReviewer, resolveAdStudioReviewer } from './llm';

function geminiResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('the clip quality check prompt', () => {
  it('names the language, quotes the intended narration word for word, and spells out what counts as major', () => {
    const { system, user } = buildClipQaPrompt({ visualPrompt: 'A lawyer signs on a phone', voiceover: '\u05e0\u05e1\u05d5 \u05e2\u05db\u05e9\u05d9\u05d5 \u05e9\u05e0\u05d9 \u05de\u05e1\u05de\u05db\u05d9\u05dd \u05d1\u05d7\u05d9\u05e0\u05dd' }, 'he');
    expect(system).toContain('never invent a problem');
    expect(user).toContain('Language of the ad: Hebrew.');
    // The findings are read by the people making the ad, so they come in its language.
    expect(user).toContain('Write each detail in Hebrew');
    expect(user).toContain('Intended narration, word for word: "\u05e0\u05e1\u05d5 \u05e2\u05db\u05e9\u05d9\u05d5 \u05e9\u05e0\u05d9 \u05de\u05e1\u05de\u05db\u05d9\u05dd \u05d1\u05d7\u05d9\u05e0\u05dd"');
    expect(user).toContain('a stutter or a cut-off word');
    expect(user).toContain('the wrong gender of a number');
    expect(user).toContain('letters, words or numbers drawn in the picture that are gibberish');
  });

  it('tells the reviewer who should speak: no lip movement for a voice-over, lip-sync for a named person on screen', () => {
    const voiceover = buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: 'Sign fast' }, 'en').user;
    expect(voiceover).toContain('Who speaks: an off-screen voice-over narrator only. Everyone in the shot must stay silent: closed or still mouths are correct.');
    const onScreen = buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: 'Sign fast', delivery: 'on_screen', speaker: 'the woman' }, 'en').user;
    expect(onScreen).toContain('Who speaks: the woman, on camera. Their lips must move in sync with the words');
    expect(buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: '' }, 'en').user).not.toContain('Who speaks');
  });

  it('never counts a closed mouth as a lip-sync problem when a narrator speaks off screen', () => {
    const voiceover = buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: 'Sign fast' }, 'en').user;
    expect(voiceover).not.toContain('a speaking mouth clearly out of sync');
    expect(voiceover).toContain('Do not report lip sync or a closed mouth');
    const onScreen = buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: 'Sign fast', delivery: 'on_screen' }, 'en').user;
    expect(onScreen).toContain('a speaking mouth clearly out of sync with the narration');
    expect(onScreen).not.toContain('Do not report lip sync');
  });

  it('makes anyone talking in a voice-over clip a major problem, so the clip is re-rendered, and nowhere calls it minor', () => {
    // Prod, 2026-11-13: a mother and child chatting under the narration were only a minor finding.
    const voiceover = buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: 'Sign fast' }, 'en').user;
    expect(voiceover).toContain('anyone in the shot visibly talking, mouthing words or moving their lips as if speaking, at any moment, is a major visual problem');
    expect(voiceover).toMatch(/Major visual problems: [^\n]*; anyone in the shot talking or mouthing words\./);
    expect(voiceover).toContain('Watch every mouth frame by frame');
    expect(voiceover).not.toMatch(/mouthing[^\n]*minor problem/);
    // Not for a person meant to speak on camera, nor for a scene without narration.
    const onScreen = buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: 'Sign fast', delivery: 'on_screen' }, 'en').user;
    expect(onScreen).not.toContain('anyone in the shot talking or mouthing words');
    expect(buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: '' }, 'en').user).not.toContain('anyone in the shot talking or mouthing words');
  });

  it('requires every issue detail in the ad language, in the system instruction too', () => {
    expect(buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: '' }, 'he').system).toContain('Write every issue detail in Hebrew');
  });

  it('says no one should speak when the scene has no narration', () => {
    expect(buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: '  ' }, 'en').user).toContain('Intended narration: none (no one should speak).');
  });

  it('gives the vowelized pronunciation as the guide to judge pronunciation by, only with narration', () => {
    const vocalized = '\u05e9\u05c1\u05b8\u05dc\u05d5\u05b9\u05dd';
    const user = buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: '\u05e9\u05dc\u05d5\u05dd', pronunciation: ` ${vocalized} ` }, 'he').user;
    expect(user).toContain(`Pronunciation guide (the same words with vowel marks, numbers written out): "${vocalized}"`);
    expect(buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: '\u05e9\u05dc\u05d5\u05dd' }, 'he').user).not.toContain('Pronunciation guide');
    expect(buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: '', pronunciation: vocalized }, 'he').user).not.toContain('Pronunciation guide');
  });
});

describe('the reviewer', () => {
  it('sends the clip as inline video bytes before the prompt, and returns the parsed verdict', async () => {
    const verdict = { transcript: '\u05e9\u05ea\u05d9 \u05de\u05e1\u05de\u05db\u05d9\u05dd', issues: [{ kind: 'audio', severity: 'major', detail: 'wrong gender', atSeconds: 3.2 }] };
    const fetchImpl = vi.fn(async () => geminiResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(verdict) }] } }] }));
    const reviewer = createGeminiReviewer('k', fetchImpl);
    const bytes = new Uint8Array([0, 1, 2, 3]);
    const result = await reviewer.reviewJson({ system: 's', user: 'u', schema: AdStudioClipQaSchema, media: { mimeType: 'video/mp4', data: bytes } });
    expect(result).toEqual(verdict);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/models\/[\w.-]+:generateContent$/);
    const body = JSON.parse(String(init.body)) as { contents: { parts: Record<string, unknown>[] }[] };
    expect(body.contents[0].parts).toEqual([{ inlineData: { mimeType: 'video/mp4', data: Buffer.from(bytes).toString('base64') } }, { text: 'u' }]);
  });

  it('asks Gemini to sample a video at the given frame rate, and leaves the default when none is given', async () => {
    const fetchImpl = vi.fn(async () => geminiResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({ transcript: '', issues: [] }) }] } }] }));
    const reviewer = createGeminiReviewer('k', fetchImpl);
    const bytes = new Uint8Array([9]);
    const image = new Uint8Array([7]);
    await reviewer.reviewJson({ system: 's', user: 'u', schema: AdStudioClipQaSchema, media: [{ mimeType: 'video/mp4', data: bytes, fps: AD_STUDIO_QA_VIDEO_FPS }, { mimeType: 'image/png', data: image }] });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { contents: { parts: Record<string, unknown>[] }[] };
    expect(AD_STUDIO_QA_VIDEO_FPS).toBe(5);
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'video/mp4', data: Buffer.from(bytes).toString('base64') }, videoMetadata: { fps: 5 } });
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: Buffer.from(image).toString('base64') } });
  });

  it('exists only with a Gemini key', () => {
    expect(resolveAdStudioReviewer({} as NodeJS.ProcessEnv)).toBeNull();
    expect(resolveAdStudioReviewer({ GEMINI_API_KEY: 'k' } as NodeJS.ProcessEnv)).toMatchObject({ provider: 'gemini' });
  });
});
