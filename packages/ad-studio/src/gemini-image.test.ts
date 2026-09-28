import { describe, expect, it, vi } from 'vitest';
import { AdStudioProviderError } from './llm';
import { createGeminiImageClient, findGeneratedImage, resolveAdStudioImageGenerator } from './gemini-image';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('createGeminiImageClient', () => {
  it('asks the Interactions API for an image in the aspect ratio, with the key only in the header, and decodes inline data', async () => {
    const fetchMock = vi.fn(async () =>
      json({ id: 'i1', status: 'completed', steps: [{ type: 'user_input', content: [] }, { type: 'model_output', content: [{ type: 'text', text: 'Here' }, { type: 'image', mime_type: 'image/png', data: PNG.toString('base64') }] }] }),
    );
    const client = createGeminiImageClient('secret-key', { fetchImpl: fetchMock });
    const image = await client.generate({ prompt: 'A lawyer at a desk', aspectRatio: '4:5' });

    expect(image).toEqual({ bytes: PNG, mimeType: 'image/png' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(url).not.toContain('secret-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'gemini-3.1-flash-image',
      input: [{ type: 'text', text: 'A lawyer at a desk' }],
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '4:5', image_size: '1K' },
    });
  });

  it('sends the image being edited next to the instruction', async () => {
    const fetchMock = vi.fn(async () => json({ id: 'i2', output_image: { mime_type: 'image/jpeg', data: PNG.toString('base64') } }));
    const client = createGeminiImageClient('k', { fetchImpl: fetchMock });
    const edited = await client.edit({ instruction: 'Warmer light', image: { bytes: PNG, mimeType: 'image/png' }, aspectRatio: '1:1' });
    expect(edited.mimeType).toBe('image/jpeg');
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.input).toEqual([
      { type: 'text', text: 'Warmer light' },
      { type: 'image', mime_type: 'image/png', data: PNG.toString('base64') },
    ]);
  });

  it('downloads an image delivered as a Files API uri', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 'i3', outputs: [{ type: 'image', mime_type: 'image/png', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media' }] }))
      .mockResolvedValueOnce(new Response(PNG, { status: 200 }));
    const client = createGeminiImageClient('k', { fetchImpl: fetchMock });
    expect((await client.generate({ prompt: 'p', aspectRatio: '1:1' })).bytes).toEqual(PNG);
    expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toBe('https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media');
  });

  it('maps provider failures to the studio codes and refuses an answer without an image', async () => {
    const billing = createGeminiImageClient('k', { fetchImpl: async () => json({ error: { message: 'Your prepayment credits are depleted.' } }, 429) });
    await expect(billing.generate({ prompt: 'p', aspectRatio: '1:1' })).rejects.toMatchObject({ code: 'provider_billing' });
    const refused = createGeminiImageClient('k', { fetchImpl: async () => json({ id: 'x', status: 'failed', error: { message: 'Blocked by safety filters' } }) });
    await expect(refused.generate({ prompt: 'p', aspectRatio: '1:1' })).rejects.toMatchObject({ code: 'refused' });
    const empty = createGeminiImageClient('k', { fetchImpl: async () => json({ id: 'y', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'no' }] }] }) });
    await expect(empty.generate({ prompt: 'p', aspectRatio: '1:1' })).rejects.toBeInstanceOf(AdStudioProviderError);
  });
});

describe('findGeneratedImage and resolveAdStudioImageGenerator', () => {
  it('ignores images in the user input and prefers the last model image', () => {
    expect(
      findGeneratedImage({
        steps: [
          { type: 'user_input', content: [{ type: 'image', data: 'aW4=' }] },
          { type: 'model_output', content: [{ type: 'image', data: 'Zmlyc3Q=' }, { type: 'image', data: 'bGFzdA==' }] },
        ],
      }),
    ).toEqual({ data: 'bGFzdA==', fileName: null, mimeType: 'image/png' });
  });

  it('is configured only with a Gemini key, and uses a loopback test server only next to the emulator', () => {
    expect(resolveAdStudioImageGenerator({} as NodeJS.ProcessEnv)).toBeNull();
    expect(resolveAdStudioImageGenerator({ GEMINI_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv)?.model).toBe('gemini-3.1-flash-image');
  });
});
