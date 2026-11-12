// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AdStudioProviderError } from './llm';
import { AD_STUDIO_TTS_MODEL, buildTtsRequestBody, createGeminiTtsClient, parseTtsAudio, pcmToWav, resolveAdStudioTts } from './tts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** "shalom" with nikud, as escapes: no Hebrew characters in code files. */
const SHALOM = 'שָׁלוֹם';

function audioResponse(data: Buffer, mimeType = 'audio/wav') {
  return { id: 'v1_tts', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'audio', mime_type: mimeType, data: data.toString('base64') }] }] };
}

describe('Gemini text-to-speech narrator', () => {
  it('asks for the words verbatim, with the style as speech metadata and the prebuilt voice by name', () => {
    expect(buildTtsRequestBody({ text: ` ${SHALOM}\n  friends `, voice: 'Sulafat', style: 'Warm ad narration in Hebrew.' })).toEqual({
      model: AD_STUDIO_TTS_MODEL,
      input: [{ type: 'user_input', content: [{ type: 'text', text: `${SHALOM} friends`, annotations: [{ type: 'speech_metadata', style: 'Warm ad narration in Hebrew.' }] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: 'Sulafat' }] },
    });
    expect(buildTtsRequestBody({ text: 'Hi', voice: 'Puck', style: ' ' }).input).toEqual([{ type: 'user_input', content: [{ type: 'text', text: 'Hi' }] }]);
  });

  it('wraps 24 kHz 16-bit mono PCM in a WAV header', () => {
    const pcm = Buffer.alloc(4800);
    const wav = pcmToWav(pcm);
    expect(wav.length).toBe(44 + 4800);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 16)).toBe('WAVEfmt ');
    expect(wav.readUInt32LE(4)).toBe(36 + 4800);
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(28)).toBe(48000); // bytes per second
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(4800);
  });

  it('reads the audio from the model_output step: WAV as sent, raw PCM wrapped at its rate, anything else refused', () => {
    const wav = pcmToWav(Buffer.alloc(100));
    expect(parseTtsAudio(audioResponse(wav))).toEqual(wav);
    const raw = parseTtsAudio(audioResponse(Buffer.alloc(100, 1), 'audio/l16;codec=pcm;rate=16000'));
    expect(raw.toString('ascii', 0, 4)).toBe('RIFF');
    expect(raw.readUInt32LE(24)).toBe(16000);
    expect(() => parseTtsAudio(audioResponse(Buffer.alloc(100, 1), 'audio/mpeg'))).toThrow(AdStudioProviderError);
    expect(() => parseTtsAudio({ id: 'x', status: 'completed', steps: [] })).toThrow(expect.objectContaining({ code: 'invalid_output' }));
    expect(() => parseTtsAudio({ id: 'x', status: 'failed', error: { message: 'Your prepayment credits are depleted' } })).toThrow(expect.objectContaining({ code: 'provider_billing' }));
  });

  it('posts to the Interactions API with the key in a header only, and maps failures to the studio codes', async () => {
    const wav = pcmToWav(Buffer.alloc(480));
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => Response.json(audioResponse(wav)));
    const client = createGeminiTtsClient('secret-key', { fetchImpl });
    expect(await client.synthesize({ text: SHALOM, voice: 'Sulafat', style: 'Warm' })).toEqual(wav);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/interactions`);
    expect(url).not.toContain('secret-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    expect(JSON.parse(String(init.body))).toMatchObject({ model: AD_STUDIO_TTS_MODEL, generation_config: { speech_config: [{ voice: 'Sulafat' }] } });

    const billing = createGeminiTtsClient('k', { fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Your prepayment credits are depleted.' } }), { status: 402 }) });
    await expect(billing.synthesize({ text: 'Hi', voice: 'Puck', style: '' })).rejects.toMatchObject({ code: 'provider_billing' });
    await expect(client.synthesize({ text: '  ', voice: 'Puck', style: '' })).rejects.toMatchObject({ code: 'invalid_output' });
  });

  it('tries a busy or failed call once more, but not a billing or safety refusal', async () => {
    const wav = pcmToWav(Buffer.alloc(480));
    let calls = 0;
    const flaky = createGeminiTtsClient('k', {
      retryDelayMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return calls === 1 ? new Response(JSON.stringify({ error: { message: 'Resource exhausted' } }), { status: 429 }) : Response.json(audioResponse(wav));
      },
    });
    expect(await flaky.synthesize({ text: 'Hi', voice: 'Puck', style: '' })).toEqual(wav);
    expect(calls).toBe(2);

    let refusals = 0;
    const refusing = createGeminiTtsClient('k', {
      retryDelayMs: 0,
      fetchImpl: async () => {
        refusals += 1;
        return new Response(JSON.stringify({ error: { message: 'Blocked by safety policy' } }), { status: 400 });
      },
    });
    await expect(refusing.synthesize({ text: 'Hi', voice: 'Puck', style: '' })).rejects.toMatchObject({ code: 'refused' });
    expect(refusals).toBe(1);
  });

  it('is configured only with GEMINI_API_KEY', () => {
    expect(resolveAdStudioTts({} as NodeJS.ProcessEnv)).toBeNull();
    expect(resolveAdStudioTts({ GEMINI_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv)?.model).toBe(AD_STUDIO_TTS_MODEL);
  });
});
