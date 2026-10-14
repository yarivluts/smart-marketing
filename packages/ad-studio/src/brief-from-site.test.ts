// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orm = vi.hoisted(() => ({ createAdStudioBrief: vi.fn(), assertAdStudioQuota: vi.fn(), recordAdStudioUsage: vi.fn() }));
vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({ ...(await importOriginal<object>()), ...orm }));
vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined), adStudioRuntime: () => ({}) }));

import { AdStudioSiteError, createAdStudioBriefFromSite } from './brief-from-site';
import type { AdStudioLlm } from './llm';

const html = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
const PAGES: Record<string, string> = {
  'https://easysign.example/': '<html><head><title>EasySign</title></head><body><h1>Sign in 30 seconds</h1><a href="/pricing">Pricing</a></body></html>',
  'https://easysign.example/pricing': '<html><head><title>Pricing</title></head><body><p>Two documents free.</p></body></html>',
};
const fetchSite = vi.fn(async (url: string) => (PAGES[url] ? html(PAGES[url]!) : new Response('no', { status: 404 })));
const deps = { fetchImpl: fetchSite as unknown as typeof fetch, resolver: vi.fn(async () => ['93.184.215.14']) };

const ANALYSIS = {
  businessName: 'EasySign',
  summary: 'Signatures on WhatsApp.',
  language: 'he',
  offerings: [{ kind: 'product', name: 'Free plan', description: 'Two documents a month', forWhom: 'Small businesses', why: 'Free to try' }],
  audiences: [{ name: 'Law firms', description: 'Small firms', needs: 'Speed', why: 'Many contracts' }],
};

function llm(result: unknown): AdStudioLlm & { generateJson: ReturnType<typeof vi.fn> } {
  return { provider: 'gemini', model: 'gemini-test', generateJson: vi.fn(async () => result) } as never;
}

const ctx = (model: AdStudioLlm, siteUrl = 'easysign.example') => ({ organizationId: 'o', projectId: 'p', actorId: 'u', llm: model, siteUrl, deps });

beforeEach(() => {
  vi.clearAllMocks();
  orm.createAdStudioBrief.mockImplementation(async (params: { input: unknown }) => ({ id: 'b1', ...(params.input as object) }));
});

describe('createAdStudioBriefFromSite', () => {
  it('reads the site and writes the whole brief for what it sells, in the site language, linking to the site', async () => {
    const model = llm(ANALYSIS);
    await createAdStudioBriefFromSite(ctx(model));
    expect(orm.createAdStudioBrief).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'o',
      projectId: 'p',
      createdByUserId: 'u',
      input: expect.objectContaining({ name: 'Free plan', landingPageUrl: 'https://easysign.example/', language: 'he', format: 'vertical', targetSeconds: 15 }),
    }));
    const input = orm.createAdStudioBrief.mock.calls[0]![0].input as { objective: string; productDescription: string };
    expect(input.objective).toContain('Small businesses');
    expect(input.productDescription).toContain('EasySign: Signatures on WhatsApp.');
    // The pricing page was read too, and the call counted toward the daily limit.
    expect(fetchSite).toHaveBeenCalledWith('https://easysign.example/pricing', expect.anything());
    expect(orm.recordAdStudioUsage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'site_analysis', outcome: 'succeeded' }));
  });

  it('uses an audience when the site names no product or service', async () => {
    await createAdStudioBriefFromSite(ctx(llm({ ...ANALYSIS, offerings: [] })));
    expect(orm.createAdStudioBrief.mock.calls[0]![0].input).toMatchObject({ name: 'Law firms' });
  });

  it('says why it could not: not a website, an unreadable site, nothing found - and creates nothing', async () => {
    await expect(createAdStudioBriefFromSite(ctx(llm(ANALYSIS), 'not a site'))).rejects.toMatchObject({ reason: 'invalid_url' });
    await expect(createAdStudioBriefFromSite(ctx(llm(ANALYSIS), 'https://easysign.example/missing'))).rejects.toBeInstanceOf(AdStudioSiteError);
    await expect(createAdStudioBriefFromSite(ctx(llm({ ...ANALYSIS, offerings: [], audiences: [] })))).rejects.toMatchObject({ reason: 'nothing_found' });
    expect(orm.createAdStudioBrief).not.toHaveBeenCalled();
  });
});
