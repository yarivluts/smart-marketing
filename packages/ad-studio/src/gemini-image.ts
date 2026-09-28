import { AdStudioProviderError } from './llm';
import { omniErrorCode, omniFileName } from './omni';
import { AD_STUDIO_TEST_OMNI_BASE_URL, adStudioTestOverride, isLoopbackHttpUrl } from './test-overrides';

/**
 * The Ad Studio's image model: Gemini 3.1 Flash Image ("Nano Banana 2") over the Interactions API,
 * the same API and key as the Omni video model. Docs: https://ai.google.dev/gemini-api/docs/image-generation,
 * https://ai.google.dev/api/interactions-api.
 *
 * - `POST /v1beta/interactions` with `{ model, input: [{type:"text"}, ...], response_format: { type:
 *   "image", mime_type, aspect_ratio, image_size } }`, answered synchronously - an image takes
 *   seconds, not minutes, so unlike video no background execution is needed.
 * - An edit sends the image to change as an input item `{ type: "image", mime_type, data }` next to
 *   the instruction.
 * - The image comes back as a content item `{ type: "image", mime_type, data | uri }` in the
 *   `model_output` step (`steps[].content[]`); `output_image` and `outputs[]` are read too, as for
 *   video. A `uri` names a Files API file, downloaded like a video file.
 * - Every generated image carries Google's SynthID watermark.
 * - The key goes only in the `x-goog-api-key` header.
 */

export const AD_STUDIO_IMAGE_MODEL = 'gemini-3.1-flash-image';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const CALL_TIMEOUT_MS = 150_000;
/** A 1K PNG is ~1-2 MB; anything this large is not an ad image. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export type AdStudioImageAspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

export interface AdStudioGeneratedImage {
  bytes: Buffer;
  mimeType: string;
}

export interface AdStudioImageGenerator {
  provider: 'gemini';
  model: string;
  generate(params: { prompt: string; aspectRatio: AdStudioImageAspectRatio }): Promise<AdStudioGeneratedImage>;
  edit(params: { instruction: string; image: AdStudioGeneratedImage; aspectRatio: AdStudioImageAspectRatio }): Promise<AdStudioGeneratedImage>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The last image content item anywhere the documented shapes put one: inline data or a file uri. */
export function findGeneratedImage(body: Json): { data: string | null; fileName: string | null; mimeType: string } | null {
  const candidates: Json[] = [];
  const direct = asObject(body.output_image);
  if (direct) candidates.push(direct);
  for (const output of Array.isArray(body.outputs) ? body.outputs : []) {
    const item = asObject(output);
    if (item && item.type === 'image') candidates.push(item);
  }
  for (const step of Array.isArray(body.steps) ? body.steps : []) {
    const stepObject = asObject(step);
    if (!stepObject || stepObject.type === 'user_input') continue;
    for (const content of Array.isArray(stepObject.content) ? stepObject.content : []) {
      const item = asObject(content);
      if (item && item.type === 'image') candidates.push(item);
    }
  }
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const item = candidates[index];
    const data = asString(item.data);
    const uri = asString(item.uri) ?? asString(item.file_uri);
    const fileName = uri ? omniFileName(uri) : null;
    if (data || fileName) return { data, fileName: data ? null : fileName, mimeType: asString(item.mime_type) ?? 'image/png' };
  }
  return null;
}

export function createGeminiImageClient(apiKey: string, options: { fetchImpl?: FetchLike; baseUrl?: string; model?: string } = {}): AdStudioImageGenerator {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = (options.baseUrl ?? GEMINI_API_BASE).replace(/\/+$/, '');
  const model = options.model ?? AD_STUDIO_IMAGE_MODEL;
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': apiKey };

  async function call(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    } catch (error) {
      throw new AdStudioProviderError('provider_error', error instanceof Error ? error.message : String(error));
    }
    if (!response.ok) {
      const body = asObject(await response.json().catch(() => ({}))) ?? {};
      const message = asString(asObject(body.error)?.message) ?? `HTTP ${response.status}`;
      throw new AdStudioProviderError(omniErrorCode(response.status, message), message);
    }
    return response;
  }

  async function interact(input: unknown[], aspectRatio: AdStudioImageAspectRatio): Promise<AdStudioGeneratedImage> {
    const response = await call('/interactions', {
      method: 'POST',
      body: JSON.stringify({ model, input, response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: aspectRatio, image_size: '1K' } }),
    });
    const body = asObject(await response.json().catch(() => ({}))) ?? {};
    const error = asObject(body.error);
    if (error || body.status === 'failed') {
      const message = asString(error?.message) ?? 'The image generation failed.';
      throw new AdStudioProviderError(omniErrorCode(0, message), message);
    }
    const found = findGeneratedImage(body);
    if (!found) throw new AdStudioProviderError('invalid_output', 'The image model returned no image.');
    let bytes: Buffer;
    if (found.data) {
      bytes = Buffer.from(found.data, 'base64');
    } else {
      const id = (found.fileName as string).slice('files/'.length);
      const download = await call(`/files/${encodeURIComponent(id)}:download?alt=media`, { method: 'GET' });
      bytes = Buffer.from(await download.arrayBuffer());
    }
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new AdStudioProviderError('invalid_output', 'The image model returned an unusable image.');
    return { bytes, mimeType: found.mimeType };
  }

  return {
    provider: 'gemini',
    model,
    generate: ({ prompt, aspectRatio }) => interact([{ type: 'text', text: prompt }], aspectRatio),
    edit: ({ instruction, image, aspectRatio }) =>
      interact(
        [
          { type: 'text', text: instruction },
          { type: 'image', mime_type: image.mimeType, data: image.bytes.toString('base64') },
        ],
        aspectRatio,
      ),
  };
}

/** The configured image model: Gemini with GEMINI_API_KEY, else null (the studio then says image ads are not set up). */
export function resolveAdStudioImageGenerator(env: NodeJS.ProcessEnv = process.env): AdStudioImageGenerator | null {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const override = adStudioTestOverride(env, AD_STUDIO_TEST_OMNI_BASE_URL);
  return createGeminiImageClient(key, override && isLoopbackHttpUrl(override) ? { baseUrl: override } : {});
}
