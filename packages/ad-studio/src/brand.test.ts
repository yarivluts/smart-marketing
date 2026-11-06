// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

const orm = vi.hoisted(() => ({
  getAdStudioBrandKit: vi.fn(),
  setAdStudioBrandKit: vi.fn(),
  setAdStudioBrandLogo: vi.fn(),
  getAdStudioAdvertiserName: vi.fn(),
}));
vi.mock('@growthos/firebase-orm-models', async (importOriginal) => ({ ...(await importOriginal<object>()), ...orm }));
vi.mock('./runtime', () => ({ ensureOrm: vi.fn(async () => undefined) }));

import { fillAdStudioBrandFromSite, resolveAdBrandMark } from './brand';
import type { AdStudioMediaStorage } from './media-storage';

const EMPTY = { brandName: '', slogan: '', toneOfVoice: '', avoidWords: [], colors: [], lastChangedOn: null, logo: null };
const ctx = { organizationId: 'o', projectId: 'p', actorId: 'u' };
const publicResolver = vi.fn(async () => ['93.184.215.14']);

function storage(objects: Record<string, Buffer> = {}): AdStudioMediaStorage & { upload: ReturnType<typeof vi.fn> } {
  return {
    upload: vi.fn(async () => undefined),
    read: async function* (path: string) {
      if (!objects[path]) throw new Error('missing');
      yield objects[path];
    },
  } as never;
}

beforeEach(() => {
  for (const fn of Object.values(orm)) fn.mockReset();
  orm.setAdStudioBrandLogo.mockImplementation(async (params: { logo: unknown }) => ({ ...EMPTY, logo: params.logo }));
});

describe('fillAdStudioBrandFromSite', () => {
  it("fills the name, slogan and logo the kit is missing, the logo as a PNG of at most 512 px", async () => {
    orm.getAdStudioBrandKit.mockResolvedValue(EMPTY);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#5b4fe9"/></svg>');
    const fetchImpl = vi.fn(async () => new Response(svg, { status: 200, headers: { 'content-type': 'image/svg+xml' } }));
    const store = storage();
    await fillAdStudioBrandFromSite(ctx, { businessName: 'EasySign', slogan: 'Sign anywhere', logoUrl: 'https://easysign.example/logo.svg' }, { storage: store, site: { fetchImpl: fetchImpl as never, resolver: publicResolver } });
    expect(orm.setAdStudioBrandKit).toHaveBeenCalledWith(expect.objectContaining({ kit: expect.objectContaining({ brandName: 'EasySign', slogan: 'Sign anywhere' }), actorId: 'u' }));
    const [path, bytes, mime] = store.upload.mock.calls[0];
    expect(path).toMatch(/^orgs\/o\/projects\/p\/brand\/logo-\d+\.png$/);
    expect(mime).toBe('image/png');
    const meta = await sharp(bytes as Buffer).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 512, 256]);
  });

  it('never overwrites what the person set, and leaves the kit alone when the logo cannot be fetched', async () => {
    orm.getAdStudioBrandKit.mockResolvedValue({ ...EMPTY, brandName: 'Mine', slogan: 'My words' });
    const store = storage();
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));
    await fillAdStudioBrandFromSite(ctx, { businessName: 'EasySign', slogan: 'Sign anywhere', logoUrl: 'https://easysign.example/logo.png' }, { storage: store, site: { fetchImpl: fetchImpl as never, resolver: publicResolver } });
    expect(orm.setAdStudioBrandKit).not.toHaveBeenCalled();
    expect(store.upload).not.toHaveBeenCalled();
  });

  it('refuses a logo on a private address', async () => {
    orm.getAdStudioBrandKit.mockResolvedValue({ ...EMPTY, brandName: 'Mine', slogan: 'x' });
    const fetchImpl = vi.fn();
    await fillAdStudioBrandFromSite(ctx, { logoUrl: 'https://intranet.example/logo.png' }, { storage: storage(), site: { fetchImpl: fetchImpl as never, resolver: vi.fn(async () => ['10.0.0.5']) } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('resolveAdBrandMark', () => {
  it('gives the strip the advertiser name, slogan, colours and logo bytes, and survives a missing logo file', async () => {
    orm.getAdStudioBrandKit.mockResolvedValue({ ...EMPTY, slogan: 'Sign anywhere', colors: ['#1e3a8a'], logo: { path: 'logo.png', mimeType: 'image/png' } });
    orm.getAdStudioAdvertiserName.mockResolvedValue('EasySign Project');
    const logo = Buffer.from('png');
    const brief = { organization_id: 'o', project_id: 'p', language: 'he' };
    expect(await resolveAdBrandMark(brief, storage({ 'logo.png': logo }))).toEqual({ name: 'EasySign Project', slogan: 'Sign anywhere', logo, colors: ['#1e3a8a'], language: 'he' });
    expect((await resolveAdBrandMark(brief, storage())).logo).toBeNull();
  });
});
