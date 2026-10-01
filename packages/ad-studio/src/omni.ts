import { AdStudioProviderError, type AdStudioProviderErrorCode } from './llm';
import { AD_STUDIO_TEST_OMNI_BASE_URL, adStudioTestOverride, isLoopbackHttpUrl } from './test-overrides';

/**
 * Gemini Omni, the Ad Studio's video model (KAN-231), over the Interactions API.
 * Docs: https://ai.google.dev/gemini-api/docs/omni, https://ai.google.dev/api/interactions-api,
 * https://ai.google.dev/gemini-api/docs/background-execution.
 *
 * - `POST /v1beta/interactions` with `{ model, input, background: true, response_format: { type:
 *   "video", aspect_ratio, resolution, delivery: "uri" } }`. `background` makes the call return at
 *   once with the interaction id and status `in_progress`, so no request of ours waits minutes on a
 *   render; the page's status poll reads `GET /v1beta/interactions/{id}` until it is `completed`.
 * - A finished interaction carries the video as a content item `{ type: "video", mime_type, uri }`
 *   in its `model_output` step (`steps[].content[]`); the docs' REST sample also reads
 *   `output_video.uri`, and older shapes used `outputs[]`, so all three are read. The uri names a
 *   Files API file (`.../v1beta/files/{ID}:download?alt=media`), polled with `GET /v1beta/files/{ID}`
 *   until `state` is `ACTIVE` (or `FAILED`) and downloaded from `:download?alt=media`.
 * - Reference images (KAN-243) go in `input` as `{ type: "image", mime_type, data }` items after the
 *   text prompt, which says how to use each; PNG and JPEG only.
 * - Edits chain with `previous_interaction_id` and the instruction as `input`; the response format
 *   is repeated because it is interaction-scoped.
 * - There is no duration parameter: the length (3-10 seconds) is asked for in the prompt, which
 *   `buildScenePrompt` does in words and as a timecode.
 * - The key goes only in the `x-goog-api-key` header, never in a URL.
 */

export const AD_STUDIO_VIDEO_MODEL = 'gemini-omni-1.1-flash';
export const AD_STUDIO_VIDEO_RESOLUTION = '720p';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const CALL_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;
/** A 10-second 720p clip is a few MB; anything this large is not a clip. */
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export type OmniAspectRatio = '9:16' | '16:9';

/** The generated video an interaction points at. */
export interface OmniVideo {
  /** Files API name, `files/{ID}`, when delivered by uri. */
  fileName: string | null;
  /** The bytes, when the API answered inline (base64) instead of by uri. */
  inlineData: Buffer | null;
  mimeType: string;
}

export interface OmniInteraction {
  id: string;
  /** `in_progress`, `completed`, `failed`, `cancelled`, `requires_action` or `incomplete`. */
  status: string;
  video: OmniVideo | null;
  error: { code: AdStudioProviderErrorCode; message: string } | null;
}

/** An image sent with a scene prompt (an app screen, an illustration, an opening frame). */
export interface OmniImageInput {
  mimeType: string;
  data: Buffer;
}

export type OmniFileState = { state: 'PROCESSING' } | { state: 'ACTIVE' } | { state: 'FAILED'; message: string };

export interface AdStudioOmni {
  model: string;
  startSceneGeneration(params: { prompt: string; aspectRatio: OmniAspectRatio; images?: readonly OmniImageInput[] }): Promise<OmniInteraction>;
  startSceneEdit(params: { previousInteractionId: string; instruction: string; aspectRatio: OmniAspectRatio }): Promise<OmniInteraction>;
  getInteraction(interactionId: string): Promise<OmniInteraction>;
  getFileState(fileName: string): Promise<OmniFileState>;
  downloadFile(fileName: string): Promise<Buffer>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const SAFETY = /safety|blocked|prohibited|responsible ai|policy|not allowed|sensitive/i;

/** Maps a provider failure to the studio's stable codes. */
export function omniErrorCode(status: number, message: string): AdStudioProviderErrorCode {
  if (status === 402 || /credits are depleted|prepayment|billing/i.test(message)) return 'provider_billing';
  if (status === 429 || /resource.?exhausted|rate limit|quota/i.test(message)) return 'rate_limited';
  if (status === 401 || status === 403) return 'not_configured';
  if (SAFETY.test(message)) return 'refused';
  return 'provider_error';
}

/** `files/{ID}` from a Files API uri, a `files/{ID}` name, or a bare id. */
export function omniFileName(value: string): string | null {
  const fromPath = /(?:^|\/)files\/([A-Za-z0-9_-]+)/.exec(value);
  if (fromPath) return `files/${fromPath[1]}`;
  return /^[A-Za-z0-9_-]+$/.test(value) ? `files/${value}` : null;
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toVideo(item: Json): OmniVideo | null {
  const uri = asString(item.uri) ?? asString(item.file_uri) ?? asString(item.name);
  const data = asString(item.data);
  const fileName = uri ? omniFileName(uri) : null;
  if (!fileName && !data) return null;
  return { fileName, inlineData: fileName ? null : Buffer.from(data as string, 'base64'), mimeType: asString(item.mime_type) ?? 'video/mp4' };
}

/** The last video content item anywhere the documented shapes put one. */
export function findOmniVideo(body: Json): OmniVideo | null {
  const candidates: Json[] = [];
  const direct = asObject(body.output_video);
  if (direct) candidates.push(direct);
  for (const output of Array.isArray(body.outputs) ? body.outputs : []) {
    const item = asObject(output);
    if (item && item.type === 'video') candidates.push(item);
  }
  for (const step of Array.isArray(body.steps) ? body.steps : []) {
    const stepObject = asObject(step);
    if (!stepObject || stepObject.type === 'user_input') continue;
    for (const content of Array.isArray(stepObject.content) ? stepObject.content : []) {
      const item = asObject(content);
      if (item && item.type === 'video') candidates.push(item);
    }
  }
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const video = toVideo(candidates[index]);
    if (video) return video;
  }
  return null;
}

export function parseOmniInteraction(body: Json): OmniInteraction {
  const id = asString(body.id);
  if (!id) throw new AdStudioProviderError('invalid_output', 'The video model returned no interaction id.');
  const video = findOmniVideo(body);
  const status = asString(body.status) ?? (video ? 'completed' : 'in_progress');
  const errorObject = asObject(body.error);
  const message = errorObject ? (asString(errorObject.message) ?? 'The video generation failed.') : null;
  return { id, status, video, error: message ? { code: omniErrorCode(0, message), message } : null };
}

async function readJson(response: Response): Promise<Json> {
  const parsed = (await response.json().catch(() => ({}))) as unknown;
  return asObject(parsed) ?? {};
}

function providerFailure(status: number, body: Json): AdStudioProviderError {
  const message = asString(asObject(body.error)?.message) ?? `HTTP ${status}`;
  return new AdStudioProviderError(omniErrorCode(status, message), message);
}

export function createOmniClient(apiKey: string, options: { fetchImpl?: FetchLike; baseUrl?: string } = {}): AdStudioOmni {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = (options.baseUrl ?? GEMINI_API_BASE).replace(/\/+$/, '');
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': apiKey };

  async function call(path: string, init: RequestInit, timeoutMs = CALL_TIMEOUT_MS): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new AdStudioProviderError('provider_error', error instanceof Error ? error.message : String(error));
    }
    if (!response.ok) throw providerFailure(response.status, await readJson(response));
    return response;
  }

  function responseFormat(aspectRatio: OmniAspectRatio) {
    return { type: 'video', aspect_ratio: aspectRatio, resolution: AD_STUDIO_VIDEO_RESOLUTION, delivery: 'uri' };
  }

  async function start(body: Json): Promise<OmniInteraction> {
    const response = await call('/interactions', { method: 'POST', body: JSON.stringify({ model: AD_STUDIO_VIDEO_MODEL, background: true, ...body }) });
    return parseOmniInteraction(await readJson(response));
  }

  function fileId(fileName: string): string {
    const name = omniFileName(fileName);
    if (!name) throw new AdStudioProviderError('invalid_output', 'The video model returned an unusable file name.');
    return name.slice('files/'.length);
  }

  return {
    model: AD_STUDIO_VIDEO_MODEL,
    startSceneGeneration: ({ prompt, aspectRatio, images }) =>
      start({
        input: images?.length ? [{ type: 'text', text: prompt }, ...images.map((image) => ({ type: 'image', mime_type: image.mimeType, data: image.data.toString('base64') }))] : prompt,
        response_format: responseFormat(aspectRatio),
      }),
    startSceneEdit: ({ previousInteractionId, instruction, aspectRatio }) =>
      start({ previous_interaction_id: previousInteractionId, input: instruction, response_format: responseFormat(aspectRatio) }),
    async getInteraction(interactionId) {
      const response = await call(`/interactions/${encodeURIComponent(interactionId)}`, { method: 'GET' });
      return parseOmniInteraction(await readJson(response));
    },
    async getFileState(fileName) {
      const body = await readJson(await call(`/files/${encodeURIComponent(fileId(fileName))}`, { method: 'GET' }));
      const state = asString(body.state);
      if (state === 'ACTIVE') return { state: 'ACTIVE' };
      if (state === 'FAILED') return { state: 'FAILED', message: asString(asObject(body.error)?.message) ?? 'The video file failed to process.' };
      return { state: 'PROCESSING' };
    },
    async downloadFile(fileName) {
      const response = await call(`/files/${encodeURIComponent(fileId(fileName))}:download?alt=media`, { method: 'GET' }, DOWNLOAD_TIMEOUT_MS);
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (declared > MAX_DOWNLOAD_BYTES) throw new AdStudioProviderError('invalid_output', 'The generated video is too large.');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_DOWNLOAD_BYTES) throw new AdStudioProviderError('invalid_output', 'The generated video could not be downloaded.');
      return bytes;
    },
  };
}

/** The configured video model: Gemini Omni with GEMINI_API_KEY, else null. */
export function resolveAdStudioOmni(env: NodeJS.ProcessEnv = process.env): AdStudioOmni | null {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const override = adStudioTestOverride(env, AD_STUDIO_TEST_OMNI_BASE_URL);
  return createOmniClient(key, override && isLoopbackHttpUrl(override) ? { baseUrl: override } : {});
}
