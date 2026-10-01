import { describe, expect, it, vi } from 'vitest';
import { AdStudioClipQaSchema, buildClipQaPrompt } from './qa';
import { createGeminiReviewer, resolveAdStudioReviewer } from './llm';

function geminiResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('the clip quality check prompt', () => {
  it('names the language, quotes the intended narration word for word, and spells out what counts as major', () => {
    const { system, user } = buildClipQaPrompt({ visualPrompt: 'A lawyer signs on a phone', voiceover: 'נסו עכשיו שני מסמכים בחינם' }, 'he');
    expect(system).toContain('never invent a problem');
    expect(user).toContain('Language of the ad: Hebrew.');
    expect(user).toContain('Intended narration, word for word: "נסו עכשיו שני מסמכים בחינם"');
    expect(user).toContain('a stutter or a cut-off word');
    expect(user).toContain('the wrong gender of a number');
    expect(user).toContain('letters, words or numbers drawn in the picture that are gibberish');
  });

  it('says no one should speak when the scene has no narration', () => {
    expect(buildClipQaPrompt({ visualPrompt: 'A desk', voiceover: '  ' }, 'en').user).toContain('Intended narration: none (no one should speak).');
  });
});

describe('the reviewer', () => {
  it('sends the clip as inline video bytes before the prompt, and returns the parsed verdict', async () => {
    const verdict = { transcript: 'שתי מסמכים', issues: [{ kind: 'audio', severity: 'major', detail: 'wrong gender', atSeconds: 3.2 }] };
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

  it('exists only with a Gemini key', () => {
    expect(resolveAdStudioReviewer({} as NodeJS.ProcessEnv)).toBeNull();
    expect(resolveAdStudioReviewer({ GEMINI_API_KEY: 'k' } as NodeJS.ProcessEnv)).toMatchObject({ provider: 'gemini' });
  });
});
