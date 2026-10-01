import { describe, expect, it, vi } from 'vitest';
import { buildIllustrationPrompt } from './references';
import { createOmniClient } from './omni';
import { buildClipQaPrompt } from './qa';
import { createGeminiReviewer } from './llm';
import { AdStudioClipQaSchema } from './qa';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('reference images in the model calls', () => {
  it('sends a scene render with its images after the prompt, and a plain prompt without them', async () => {
    const fetchImpl = vi.fn(async () => json({ id: 'v1_1', status: 'in_progress' }));
    const omni = createOmniClient('k', { fetchImpl });
    await omni.startSceneGeneration({ prompt: 'A desk', aspectRatio: '16:9', images: [{ mimeType: 'image/png', data: Buffer.from([1, 2, 3]) }] });
    await omni.startSceneGeneration({ prompt: 'A desk', aspectRatio: '16:9' });
    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)) as { input: unknown });
    expect(bodies[0].input).toEqual([
      { type: 'text', text: 'A desk' },
      { type: 'image', mime_type: 'image/png', data: Buffer.from([1, 2, 3]).toString('base64') },
    ]);
    expect(bodies[1].input).toBe('A desk');
  });

  it('checks a clip against its images: the clip first, then each image, with a rule per use', async () => {
    const { user } = buildClipQaPrompt({ visualPrompt: 'A laptop', voiceover: '' }, 'en', [
      { use: 'screen', label: 'Dashboard', description: 'The ad studio' },
      { use: 'subject', label: 'Logo', description: '' },
    ]);
    expect(user).toContain('After the video come 2 reference image(s) the clip was made from:');
    expect(user).toContain('Reference image 1 (Dashboard: The ad studio) is the real product screen.');
    expect(user).toContain('Reference image 2 (Logo) shows how this subject must look.');
    expect(buildClipQaPrompt({ visualPrompt: 'A laptop', voiceover: '' }, 'en').user).not.toContain('reference image');

    const fetchImpl = vi.fn(async () => json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ transcript: '', issues: [] }) }] } }] }));
    await createGeminiReviewer('k', fetchImpl).reviewJson({
      system: 's',
      user: 'u',
      schema: AdStudioClipQaSchema,
      media: [
        { mimeType: 'video/mp4', data: new Uint8Array([9]) },
        { mimeType: 'image/png', data: new Uint8Array([7]) },
      ],
    });
    const parts = (JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { contents: { parts: unknown[] }[] }).contents[0].parts;
    expect(parts).toEqual([{ inlineData: { mimeType: 'video/mp4', data: 'CQ==' } }, { inlineData: { mimeType: 'image/png', data: 'Bw==' } }, { text: 'u' }]);
  });

  it('asks the image model for a clean full-screen illustration of what the person described', () => {
    expect(buildIllustrationPrompt('  A phone showing  a signed contract ')).toBe('A phone showing a signed contract\nA clean, polished, high-resolution image for a video ad, sharp enough to be shown full screen.');
  });
});
