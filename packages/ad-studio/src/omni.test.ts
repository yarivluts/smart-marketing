// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AD_STUDIO_VIDEO_MODEL, createOmniClient, findOmniVideo, omniErrorCode, omniFileName, parseOmniInteraction, resolveAdStudioOmni } from './omni';
import { AdStudioProviderError } from './llm';


const BASE = 'https://generativelanguage.googleapis.com/v1beta';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** The documented completed shape: the video sits in the model_output step. */
const COMPLETED = {
  id: 'v1_interaction',
  status: 'completed',
  model: AD_STUDIO_VIDEO_MODEL,
  object: 'interaction',
  steps: [
    { type: 'user_input', content: [{ type: 'text', text: 'prompt' }] },
    { type: 'thought', content: [{ type: 'thought', text: '...' }] },
    { type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', uri: `${BASE}/files/abc123:download?alt=media` }] },
  ],
};

describe('parsing the documented interaction shapes', () => {
  it('reads the video from the model_output step, from output_video, or from outputs[]', () => {
    expect(parseOmniInteraction(COMPLETED)).toEqual({ id: 'v1_interaction', status: 'completed', video: { fileName: 'files/abc123', inlineData: null, mimeType: 'video/mp4' }, error: null });
    expect(findOmniVideo({ output_video: { uri: 'files/xyz' } })?.fileName).toBe('files/xyz');
    expect(findOmniVideo({ outputs: [{ type: 'text', text: 'hi' }, { type: 'video', uri: `${BASE}/files/o1` }] })?.fileName).toBe('files/o1');
  });

  it('takes inline base64 when there is no uri, and reads a background start as in progress', () => {
    const inline = parseOmniInteraction({ id: 'v1_x', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'video', data: Buffer.from('mp4').toString('base64') }] }] });
    expect(inline.video?.inlineData?.toString()).toBe('mp4');
    expect(parseOmniInteraction({ id: 'v1_bg', status: 'in_progress' })).toMatchObject({ status: 'in_progress', video: null });
    expect(parseOmniInteraction({ id: 'v1_nostatus' }).status).toBe('in_progress');
  });

  it('classifies a failed interaction error and refuses a body without an id', () => {
    expect(parseOmniInteraction({ id: 'v1_f', status: 'failed', error: { code: 'x', message: 'Blocked by safety filters' } }).error).toEqual({ code: 'refused', message: 'Blocked by safety filters' });
    expect(() => parseOmniInteraction({ status: 'completed' })).toThrow(AdStudioProviderError);
  });

  it('derives Files API names and maps provider failures to the studio codes', () => {
    expect(omniFileName(`${BASE}/files/abc-1_2:download?alt=media`)).toBe('files/abc-1_2');
    expect(omniFileName('files/abc')).toBe('files/abc');
    expect(omniFileName('abc')).toBe('files/abc');
    expect(omniFileName('https://example.com/video.mp4')).toBeNull();
    expect(omniErrorCode(402, 'x')).toBe('provider_billing');
    expect(omniErrorCode(400, 'Your prepayment credits are depleted.')).toBe('provider_billing');
    expect(omniErrorCode(429, 'x')).toBe('rate_limited');
    expect(omniErrorCode(403, 'x')).toBe('not_configured');
    expect(omniErrorCode(400, 'The prompt was blocked for safety reasons')).toBe('refused');
    expect(omniErrorCode(500, 'Internal')).toBe('provider_error');
  });
});

describe('createOmniClient', () => {
  it('starts a background render with the key only in a header and the documented response format', async () => {
    const fetchImpl = vi.fn(async () => json(200, { id: 'v1_new', status: 'in_progress' }));
    const omni = createOmniClient('secret-key', { fetchImpl });
    await expect(omni.startSceneGeneration({ prompt: 'A desk', aspectRatio: '9:16' })).resolves.toEqual({ id: 'v1_new', status: 'in_progress', video: null, error: null });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/interactions`);
    expect(url).not.toContain('secret-key');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'gemini-omni-1.1-flash',
      background: true,
      input: 'A desk',
      response_format: { type: 'video', aspect_ratio: '9:16', resolution: '720p', delivery: 'uri' },
    });
  });

  it('chains an edit from the previous interaction with the instruction as input', async () => {
    const fetchImpl = vi.fn(async () => json(200, COMPLETED));
    const omni = createOmniClient('k', { fetchImpl });
    const result = await omni.startSceneEdit({ previousInteractionId: 'v1_prev', instruction: 'Make it night', aspectRatio: '16:9' });
    expect(result.video?.fileName).toBe('files/abc123');
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ previous_interaction_id: 'v1_prev', input: 'Make it night', response_format: { aspect_ratio: '16:9' } });
  });

  it('asks for the resolution the ad chose, for a render and for an edit', async () => {
    const fetchImpl = vi.fn(async () => json(200, { id: 'v1_new', status: 'in_progress' }));
    const omni = createOmniClient('k', { fetchImpl });
    await omni.startSceneGeneration({ prompt: 'A desk', aspectRatio: '9:16', resolution: '1080p' });
    await omni.startSceneEdit({ previousInteractionId: 'v1_prev', instruction: 'Night', aspectRatio: '9:16', resolution: '360p' });
    const bodies = (fetchImpl.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => JSON.parse(String(init.body)));
    expect(bodies.map((body) => body.response_format.resolution)).toEqual(['1080p', '360p']);
  });

  it('polls the interaction and the file, and downloads the bytes', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/interactions/v1_interaction')) return json(200, COMPLETED);
      if (url.endsWith('/files/abc123')) return json(200, { name: 'files/abc123', state: calls.length > 2 ? 'ACTIVE' : 'PROCESSING' });
      if (url.endsWith('/files/abc123:download?alt=media')) return new Response(Buffer.from('fake-mp4'), { status: 200 });
      return json(404, { error: { message: 'unexpected' } });
    });
    const omni = createOmniClient('k', { fetchImpl });
    expect((await omni.getInteraction('v1_interaction')).video?.fileName).toBe('files/abc123');
    expect(await omni.getFileState('files/abc123')).toEqual({ state: 'PROCESSING' });
    expect(await omni.getFileState(`${BASE}/files/abc123:download?alt=media`)).toEqual({ state: 'ACTIVE' });
    expect((await omni.downloadFile('files/abc123')).toString()).toBe('fake-mp4');
    expect(calls.every((url) => !url.includes('key='))).toBe(true);
  });

  it('reports a failed file with its message, and a 402 as provider_billing', async () => {
    const failed = createOmniClient('k', { fetchImpl: async () => json(200, { state: 'FAILED', error: { message: 'bad frames' } }) });
    expect(await failed.getFileState('files/a')).toEqual({ state: 'FAILED', message: 'bad frames' });
    const billing = createOmniClient('k', { fetchImpl: async () => json(402, { error: { message: 'Your prepayment credits are depleted.' } }) });
    await expect(billing.startSceneGeneration({ prompt: 'x', aspectRatio: '9:16' })).rejects.toMatchObject({ code: 'provider_billing' });
    const offline = createOmniClient('k', {
      fetchImpl: async () => {
        throw new Error('ECONNRESET');
      },
    });
    await expect(offline.getInteraction('v1')).rejects.toMatchObject({ code: 'provider_error', message: 'ECONNRESET' });
  });
});

describe('resolveAdStudioOmni', () => {
  it('needs GEMINI_API_KEY, and honours the fake base URL only next to the emulator and only on loopback', async () => {
    expect(resolveAdStudioOmni({} as NodeJS.ProcessEnv)).toBeNull();
    const fetchMock = vi.fn(async () => json(200, { id: 'v1', status: 'in_progress' }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const run = (env: Record<string, string>) => resolveAdStudioOmni({ GEMINI_API_KEY: 'k', ...env } as unknown as NodeJS.ProcessEnv)?.startSceneGeneration({ prompt: 'x', aspectRatio: '9:16' });
      await run({ AD_STUDIO_TEST_OMNI_BASE_URL: 'http://127.0.0.1:4555/v1beta' });
      await run({ AD_STUDIO_TEST_OMNI_BASE_URL: 'http://127.0.0.1:4555/v1beta', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8090' });
      await run({ AD_STUDIO_TEST_OMNI_BASE_URL: 'https://evil.example.com/v1beta', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8090' });
      expect(fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])).toEqual([`${BASE}/interactions`, 'http://127.0.0.1:4555/v1beta/interactions', `${BASE}/interactions`]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
