// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import type Anthropic from '@anthropic-ai/sdk';
import { AdStudioProviderError, AD_STUDIO_CLAUDE_MODEL, AD_STUDIO_GEMINI_TEXT_MODEL, createClaudeLlm, createGeminiLlm, describeAdStudioProviders, resolveAdStudioLlm } from './llm';

vi.mock('server-only', () => ({}));

const Schema = z.object({ title: z.string(), count: z.number() });

function geminiResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('createGeminiLlm', () => {
  it('sends the key in a header, the system instruction, and the JSON schema; returns validated JSON', async () => {
    const fetchImpl = vi.fn(async () => geminiResponse(200, { candidates: [{ content: { parts: [{ text: '{"title":"Ad","count":3}' }] } }] }));
    const llm = createGeminiLlm('test-key', fetchImpl);
    await expect(llm.generateJson({ system: 'SYS', user: 'USER', schema: Schema })).resolves.toEqual({ title: 'Ad', count: 3 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${AD_STUDIO_GEMINI_TEXT_MODEL}:generateContent`);
    expect(url).not.toContain('test-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe('SYS');
    expect(body.contents[0].parts[0].text).toBe('USER');
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } });
  });

  it('maps a depleted-credits 402 to provider_billing, 429 to rate_limited, 403 to not_configured', async () => {
    const cases: [number, string, string][] = [
      [402, 'Your prepayment credits are depleted.', 'provider_billing'],
      [429, 'Resource exhausted', 'rate_limited'],
      [403, 'API key not valid', 'not_configured'],
      [500, 'Internal', 'provider_error'],
    ];
    for (const [status, message, code] of cases) {
      const llm = createGeminiLlm('k', async () => geminiResponse(status, { error: { message } }));
      await expect(llm.generateJson({ system: '', user: '', schema: Schema })).rejects.toMatchObject({ code, message });
    }
  });

  it('reports a safety block as refused, and non-JSON or schema-mismatched output as invalid_output', async () => {
    const blocked = createGeminiLlm('k', async () => geminiResponse(200, { promptFeedback: { blockReason: 'SAFETY' } }));
    await expect(blocked.generateJson({ system: '', user: '', schema: Schema })).rejects.toMatchObject({ code: 'refused' });
    const prose = createGeminiLlm('k', async () => geminiResponse(200, { candidates: [{ content: { parts: [{ text: 'Sure! Here it is' }] } }] }));
    await expect(prose.generateJson({ system: '', user: '', schema: Schema })).rejects.toMatchObject({ code: 'invalid_output' });
    const wrong = createGeminiLlm('k', async () => geminiResponse(200, { candidates: [{ content: { parts: [{ text: '{"title":1}' }] } }] }));
    await expect(wrong.generateJson({ system: '', user: '', schema: Schema })).rejects.toBeInstanceOf(AdStudioProviderError);
  });
});

describe('createClaudeLlm', () => {
  function fakeClient(result: unknown) {
    const parse = vi.fn(async () => result);
    return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
  }

  it('asks Claude Opus 5 for schema-bound output with server-side refusal fallbacks, and returns the parsed object', async () => {
    const { client, parse } = fakeClient({ stop_reason: 'end_turn', parsed_output: { title: 'Ad', count: 2 } });
    const llm = createClaudeLlm('k', client);
    expect(llm).toMatchObject({ provider: 'anthropic', model: AD_STUDIO_CLAUDE_MODEL });
    await expect(llm.generateJson({ system: 'SYS', user: 'USER', schema: Schema })).resolves.toEqual({ title: 'Ad', count: 2 });
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-5',
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: 'SYS',
        messages: [{ role: 'user', content: 'USER' }],
        output_config: { format: expect.anything() },
      }),
    );
  });

  it('treats a refusal as refused and a missing parsed_output as invalid_output', async () => {
    await expect(
      createClaudeLlm('k', fakeClient({ stop_reason: 'refusal', stop_details: { explanation: 'declined' }, parsed_output: null }).client).generateJson({ system: '', user: '', schema: Schema }),
    ).rejects.toMatchObject({ code: 'refused', message: 'declined' });
    await expect(
      createClaudeLlm('k', fakeClient({ stop_reason: 'max_tokens', parsed_output: null }).client).generateJson({ system: '', user: '', schema: Schema }),
    ).rejects.toMatchObject({ code: 'invalid_output' });
  });
});

describe('resolveAdStudioLlm', () => {
  it('prefers Claude when an Anthropic key is set, falls back to Gemini, and is null with neither', () => {
    expect(resolveAdStudioLlm({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' } as NodeJS.ProcessEnv)?.provider).toBe('anthropic');
    expect(resolveAdStudioLlm({ GEMINI_API_KEY: 'g' } as NodeJS.ProcessEnv)?.provider).toBe('gemini');
    expect(resolveAdStudioLlm({ ANTHROPIC_API_KEY: '  ' } as NodeJS.ProcessEnv)).toBeNull();
    expect(describeAdStudioProviders({ GEMINI_API_KEY: 'g' } as NodeJS.ProcessEnv)).toEqual({ text: { provider: 'gemini', model: AD_STUDIO_GEMINI_TEXT_MODEL }, videoConfigured: true });
    expect(describeAdStudioProviders({} as NodeJS.ProcessEnv)).toEqual({ text: null, videoConfigured: false });
  });
});
