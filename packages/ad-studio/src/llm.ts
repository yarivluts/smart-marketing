import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { AD_STUDIO_TEST_OMNI_BASE_URL, adStudioTestOverride, isLoopbackHttpUrl } from './test-overrides';

/**
 * The Ad Studio's text model (KAN-229): plans, scripts and scene rewrites. Claude when an Anthropic
 * key is configured, otherwise Gemini with the same Google key the video model uses. Both return
 * JSON validated against the same zod schema, so callers never see an unvalidated shape.
 */

export const AD_STUDIO_CLAUDE_MODEL = 'claude-opus-5-5';
export const AD_STUDIO_GEMINI_TEXT_MODEL = 'gemini-3.8-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type AdStudioProviderName = 'anthropic' | 'gemini';

/**
 * Why a provider call did not produce usable output, as a stable code the UI translates:
 * - `not_configured`: no API key for any provider.
 * - `provider_billing`: the provider refused for billing (e.g. Gemini prepayment credits depleted).
 * - `rate_limited`, `refused` (safety decline), `invalid_output` (did not match the schema),
 *   `provider_error` (anything else, with the provider's message kept for the usage log).
 */
export type AdStudioProviderErrorCode = 'not_configured' | 'provider_billing' | 'rate_limited' | 'refused' | 'invalid_output' | 'provider_error';

export class AdStudioProviderError extends Error {
  constructor(
    public readonly code: AdStudioProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AdStudioProviderError';
  }
}

/**
 * How hard the model should think. Opus 5.5 defaults to `medium`; the studio sets it per call so a
 * plan gets deep analysis while vowel marks and length repairs stay fast and cheap.
 */
export type AdStudioEffort = 'low' | 'medium' | 'high';

export interface AdStudioJsonRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Defaults to `medium`. Gemini ignores it. */
  effort?: AdStudioEffort;
}

export interface AdStudioLlm {
  provider: AdStudioProviderName;
  model: string;
  generateJson<T>(request: AdStudioJsonRequest<T>): Promise<T>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createClaudeLlm(apiKey: string, client: Anthropic = new Anthropic({ apiKey })): AdStudioLlm {
  return {
    provider: 'anthropic',
    model: AD_STUDIO_CLAUDE_MODEL,
    async generateJson<T>({ system, user, schema, effort = 'medium' }: AdStudioJsonRequest<T>): Promise<T> {
      try {
        // Streamed, so a long plan never hits the HTTP request timeout; finalMessage() still returns the parsed output.
        const response = await client.beta.messages.stream({
          model: AD_STUDIO_CLAUDE_MODEL,
          max_tokens: 16000,
          // Server-side refusal fallback: a policy decline is retried on the fallback model in the same call.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system,
          messages: [{ role: 'user', content: user }],
          output_config: { effort, format: betaZodOutputFormat(schema) },
        }).finalMessage();
        if (response.stop_reason === 'refusal') {
          throw new AdStudioProviderError('refused', response.stop_details?.explanation ?? 'The model declined this request.');
        }
        if (response.stop_reason === 'max_tokens') {
          throw new AdStudioProviderError('invalid_output', 'The answer was cut off at the output limit before it was complete.');
        }
        if (response.parsed_output === null || response.parsed_output === undefined) {
          throw new AdStudioProviderError('invalid_output', `Output did not match the schema (stop reason ${response.stop_reason}).`);
        }
        return response.parsed_output as T;
      } catch (error) {
        if (error instanceof AdStudioProviderError) throw error;
        if (error instanceof Anthropic.RateLimitError) throw new AdStudioProviderError('rate_limited', error.message);
        if (error instanceof Anthropic.PermissionDeniedError || error instanceof Anthropic.AuthenticationError) {
          throw new AdStudioProviderError('not_configured', error.message);
        }
        if (error instanceof Anthropic.APIError) {
          const billing = error.status === 402 || /credit balance|billing/i.test(error.message);
          throw new AdStudioProviderError(billing ? 'provider_billing' : 'provider_error', error.message);
        }
        throw new AdStudioProviderError('provider_error', error instanceof Error ? error.message : String(error));
      }
    },
  };
}

function geminiErrorCode(status: number, message: string): AdStudioProviderErrorCode {
  if (status === 402 || /credits are depleted|billing/i.test(message)) return 'provider_billing';
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'not_configured';
  return 'provider_error';
}

/** How a Gemini call waits and retries. Injectable so tests don't sleep. */
export interface GeminiCallOptions {
  /** Abort one attempt after this long. Text calls default to 90s; the video reviewer to 180s. */
  timeoutMs?: number;
  /** Attempts in all, for network errors, timeouts, 429 and 5xx. Default 3. */
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Backoff before retry `n` (1-based): about 0.5s, 1s, 2s with jitter, or the server's Retry-After when it gives one. */
function retryDelayMs(retry: number, retryAfter: string | null): number {
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  return 500 * 2 ** (retry - 1) + Math.floor(Math.random() * 250);
}

type GeminiBody = {
  error?: { message?: string };
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
};

/**
 * One Gemini generateContent call that must answer JSON matching `schema`; `media` rides along as
 * inline bytes, in order, before the prompt. Each attempt has a timeout; network errors, timeouts,
 * rate limits and server errors are retried with backoff. Billing, auth and safety refusals are not.
 */
async function geminiJson<T>(
  apiKey: string,
  fetchImpl: FetchLike,
  baseUrl: string,
  model: string,
  request: AdStudioJsonRequest<T> & { media?: AdStudioMediaInput | readonly AdStudioMediaInput[] },
  options: GeminiCallOptions = {},
): Promise<T> {
  const { timeoutMs = 90_000, attempts = 3, sleep = defaultSleep } = options;
  const parts: Record<string, unknown>[] = [];
  const media = request.media === undefined ? [] : Array.isArray(request.media) ? request.media : [request.media as AdStudioMediaInput];
  for (const item of media) parts.push({ inlineData: { mimeType: item.mimeType, data: Buffer.from(item.data).toString('base64') } });
  parts.push({ text: request.user });
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: request.system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: z.toJSONSchema(request.schema), maxOutputTokens: 16_384 },
  });
  let body: GeminiBody = {};
  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (attempt < attempts) {
        await sleep(retryDelayMs(attempt, null));
        continue;
      }
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new AdStudioProviderError('provider_error', timedOut ? `No answer within ${Math.round(timeoutMs / 1000)}s.` : error instanceof Error ? error.message : String(error));
    }
    body = (await response.json().catch(() => ({}))) as GeminiBody;
    if (response.ok) break;
    const message = body.error?.message ?? `HTTP ${response.status}`;
    const code = geminiErrorCode(response.status, message);
    if (attempt < attempts && RETRYABLE_STATUSES.has(response.status) && code !== 'provider_billing') {
      await sleep(retryDelayMs(attempt, response.headers.get('retry-after')));
      continue;
    }
    throw new AdStudioProviderError(code, message);
  }
  const candidate = body.candidates?.[0];
  if (body.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
    throw new AdStudioProviderError('refused', `The model declined this request (${body.promptFeedback?.blockReason ?? candidate?.finishReason}).`);
  }
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new AdStudioProviderError('invalid_output', 'The answer was cut off at the output limit before it was complete.');
  }
  const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AdStudioProviderError('invalid_output', 'The model did not return JSON.');
  }
  const result = request.schema.safeParse(parsed);
  if (!result.success) throw new AdStudioProviderError('invalid_output', `Output did not match the schema: ${result.error.message}`);
  return result.data;
}

export function createGeminiLlm(apiKey: string, fetchImpl: FetchLike = fetch, baseUrl: string = GEMINI_API_BASE, options: GeminiCallOptions = {}): AdStudioLlm {
  return {
    provider: 'gemini',
    model: AD_STUDIO_GEMINI_TEXT_MODEL,
    generateJson: (request) => geminiJson(apiKey, fetchImpl, baseUrl, AD_STUDIO_GEMINI_TEXT_MODEL, request, options),
  };
}

/** A media file sent to a model with a prompt, as raw bytes. */
export interface AdStudioMediaInput {
  mimeType: string;
  data: Uint8Array;
}

/**
 * A model that watches and listens: it gets a clip with a prompt and answers JSON. Used for the AI
 * quality check of rendered clips. Always Gemini, whatever the text model is, because it takes video.
 */
export interface AdStudioReviewer {
  provider: 'gemini';
  model: string;
  /** The clip first, then any reference images it is checked against. */
  reviewJson<T>(request: AdStudioJsonRequest<T> & { media: AdStudioMediaInput | readonly AdStudioMediaInput[] }): Promise<T>;
}

export function createGeminiReviewer(apiKey: string, fetchImpl: FetchLike = fetch, baseUrl: string = GEMINI_API_BASE, options: GeminiCallOptions = {}): AdStudioReviewer {
  return {
    provider: 'gemini',
    model: AD_STUDIO_GEMINI_TEXT_MODEL,
    // Watching a clip takes longer than writing text.
    reviewJson: (request) => geminiJson(apiKey, fetchImpl, baseUrl, AD_STUDIO_GEMINI_TEXT_MODEL, request, { timeoutMs: 180_000, ...options }),
  };
}

/** The reviewer for the quality check: Gemini with GEMINI_API_KEY, else null (the check is then skipped). */
export function resolveAdStudioReviewer(env: NodeJS.ProcessEnv = process.env): AdStudioReviewer | null {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (!geminiKey) return null;
  // The same guarded loopback stand-in the other Gemini models use (emulator runs only).
  const override = adStudioTestOverride(env, AD_STUDIO_TEST_OMNI_BASE_URL);
  return createGeminiReviewer(geminiKey, fetch, override && isLoopbackHttpUrl(override) ? override : GEMINI_API_BASE);
}

/** The configured text model: Claude when ANTHROPIC_API_KEY is set, else Gemini with GEMINI_API_KEY, else null. */
export function resolveAdStudioLlm(env: NodeJS.ProcessEnv = process.env): AdStudioLlm | null {
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) return createClaudeLlm(anthropicKey);
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    // The same guarded loopback stand-in the image and video models use (emulator runs only).
    const override = adStudioTestOverride(env, AD_STUDIO_TEST_OMNI_BASE_URL);
    return createGeminiLlm(geminiKey, fetch, override && isLoopbackHttpUrl(override) ? override : GEMINI_API_BASE);
  }
  return null;
}

/** What the admin panel shows about the text model, without touching any key. */
export function describeAdStudioProviders(env: NodeJS.ProcessEnv = process.env): {
  text: { provider: AdStudioProviderName; model: string } | null;
  videoConfigured: boolean;
} {
  const text = env.ANTHROPIC_API_KEY?.trim()
    ? { provider: 'anthropic' as const, model: AD_STUDIO_CLAUDE_MODEL }
    : env.GEMINI_API_KEY?.trim()
      ? { provider: 'gemini' as const, model: AD_STUDIO_GEMINI_TEXT_MODEL }
      : null;
  return { text, videoConfigured: Boolean(env.GEMINI_API_KEY?.trim()) };
}
