import { AdStudioProviderError, type AdStudioProviderErrorCode } from './llm';
import { omniErrorCode } from './omni';
import { AD_STUDIO_TEST_OMNI_BASE_URL, adStudioTestOverride, isLoopbackHttpUrl } from './test-overrides';

/**
 * The voice-over narrator: Gemini text-to-speech over the Interactions API, the same API and key as
 * the Omni video model. A voice-over scene's clip is made without speech and this narration is mixed
 * onto it afterwards (see `narrationIsSeparate` in `@growthos/shared`), so no one on screen mouths it.
 * Docs: https://ai.google.dev/gemini-api/docs/speech-generation.
 *
 * - `POST /v1beta/interactions` with `{ model, input: [{ type: "user_input", content: [{ type:
 *   "text", text, annotations: [{ type: "speech_metadata", style }] }] }], response_format: { type:
 *   "audio" }, generation_config: { speech_config: [{ voice }] } }`, answered synchronously (seconds).
 *   The text is said verbatim; how it is said goes in the `speech_metadata` style, one short constant
 *   string per ad as the docs advise. The language is detected from the text (Hebrew is supported;
 *   vocalized Hebrew with nikud is read as vocalized).
 * - The audio comes back as a content item `{ type: "audio", mime_type, data }` in the `model_output`
 *   step: `audio/wav` (RIFF, 24 kHz 16-bit mono PCM) by default. Headerless PCM (`audio/l16`,
 *   `audio/pcm`) is wrapped as WAV here, so ffmpeg always gets a WAV file.
 * - The key goes only in the `x-goog-api-key` header.
 */

export const AD_STUDIO_TTS_MODEL = 'gemini-3.8-flash-tts';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Two tries fit well inside the clip lease (120 s) with the mix after them. */
const CALL_TIMEOUT_MS = 45_000;
/** A 10-second line is ~0.5 MB of WAV; anything this large is not a scene's narration. */
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const AD_STUDIO_TTS_SAMPLE_RATE = 24_000;

export interface AdStudioTtsRequest {
  /** Exactly the words to say (the vocalized line for Hebrew when there is one). */
  text: string;
  /** A prebuilt voice name (see `ttsVoiceName`). */
  voice: string;
  /** How to say it (see `ttsNarrationStyle`). */
  style: string;
}

export interface AdStudioTts {
  model: string;
  /** The narration as a WAV file. */
  synthesize(request: AdStudioTtsRequest): Promise<Buffer>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The request body for one line of narration. */
export function buildTtsRequestBody(request: AdStudioTtsRequest, model: string = AD_STUDIO_TTS_MODEL): Json {
  const style = request.style.trim();
  return {
    model,
    input: [
      {
        type: 'user_input',
        content: [{ type: 'text', text: request.text.replace(/\s+/g, ' ').trim(), ...(style ? { annotations: [{ type: 'speech_metadata', style }] } : {}) }],
      },
    ],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: request.voice }] },
  };
}

/** A WAV (RIFF) file around headerless 16-bit little-endian PCM. */
export function pcmToWav(pcm: Buffer, sampleRate: number = AD_STUDIO_TTS_SAMPLE_RATE, channels = 1): Buffer {
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function isWav(bytes: Buffer): boolean {
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
}

/** The last audio content item anywhere the documented shapes put one. */
function findAudio(body: Json): { data: string; mimeType: string } | null {
  const candidates: Json[] = [];
  const direct = asObject(body.output_audio);
  if (direct) candidates.push(direct);
  for (const output of Array.isArray(body.outputs) ? body.outputs : []) {
    const item = asObject(output);
    if (item && item.type === 'audio') candidates.push(item);
  }
  for (const step of Array.isArray(body.steps) ? body.steps : []) {
    const stepObject = asObject(step);
    if (!stepObject || stepObject.type === 'user_input') continue;
    for (const content of Array.isArray(stepObject.content) ? stepObject.content : []) {
      const item = asObject(content);
      if (item && item.type === 'audio') candidates.push(item);
    }
  }
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const data = asString(candidates[index].data);
    if (data) return { data, mimeType: asString(candidates[index].mime_type) ?? 'audio/wav' };
  }
  return null;
}

/** The narration in a TTS response as a WAV file: as sent when it is WAV, wrapped when it is raw PCM. */
export function parseTtsAudio(body: Json): Buffer {
  const error = asObject(body.error);
  if (error || body.status === 'failed') {
    const message = asString(error?.message) ?? 'The speech generation failed.';
    throw new AdStudioProviderError(omniErrorCode(0, message), message);
  }
  const audio = findAudio(body);
  if (!audio) throw new AdStudioProviderError('invalid_output', 'The speech model returned no audio.');
  const bytes = Buffer.from(audio.data, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_AUDIO_BYTES) throw new AdStudioProviderError('invalid_output', 'The speech model returned unusable audio.');
  if (isWav(bytes)) return bytes;
  const mime = audio.mimeType.toLowerCase();
  if (!/audio\/(l16|pcm)/.test(mime)) throw new AdStudioProviderError('invalid_output', `The speech model returned audio as ${audio.mimeType}.`);
  const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? AD_STUDIO_TTS_SAMPLE_RATE);
  return pcmToWav(bytes, rate);
}

/** Failures worth one more try within the same request: a busy service or a network hiccup. */
const RETRYABLE: ReadonlySet<AdStudioProviderErrorCode> = new Set(['rate_limited', 'provider_error']);

export function createGeminiTtsClient(apiKey: string, options: { fetchImpl?: FetchLike; baseUrl?: string; model?: string; retryDelayMs?: number } = {}): AdStudioTts {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = (options.baseUrl ?? GEMINI_API_BASE).replace(/\/+$/, '');
  const model = options.model ?? AD_STUDIO_TTS_MODEL;
  const retryDelayMs = options.retryDelayMs ?? 2_000;

  async function once(request: AdStudioTtsRequest): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}/interactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(buildTtsRequestBody(request, model)),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AdStudioProviderError('provider_error', error instanceof Error ? error.message : String(error));
    }
    const body = asObject(await response.json().catch(() => ({}))) ?? {};
    if (!response.ok) {
      const message = asString(asObject(body.error)?.message) ?? `HTTP ${response.status}`;
      throw new AdStudioProviderError(omniErrorCode(response.status, message), message);
    }
    return parseTtsAudio(body);
  }

  return {
    model,
    async synthesize(request) {
      if (!request.text.trim()) throw new AdStudioProviderError('invalid_output', 'There is no narration to speak.');
      try {
        return await once(request);
      } catch (error) {
        if (!(error instanceof AdStudioProviderError) || !RETRYABLE.has(error.code)) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        return once(request);
      }
    },
  };
}

/** The configured narrator: Gemini TTS with GEMINI_API_KEY, else null. */
export function resolveAdStudioTts(env: NodeJS.ProcessEnv = process.env): AdStudioTts | null {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const override = adStudioTestOverride(env, AD_STUDIO_TEST_OMNI_BASE_URL);
  return createGeminiTtsClient(key, override && isLoopbackHttpUrl(override) ? { baseUrl: override } : {});
}
