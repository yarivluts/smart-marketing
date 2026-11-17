import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createMemoryMediaStorage } from './media-storage';
import { configureAdStudioRuntime, resetAdStudioRuntime } from './runtime';

const orm = vi.hoisted(() => {
  const gallery = new Map<string, Record<string, unknown>>();
  const refs = new Map<string, Record<string, unknown>>();
  const clips = new Map<string, Record<string, unknown>>();
  const images = new Map<string, Record<string, unknown>>();
  const demos = new Map<string, Record<string, unknown>>();
  const briefs = new Map<string, Record<string, unknown>>();

  class NotFound extends Error {}
  class GalleryInvalid extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  }

  return {
    gallery,
    refs,
    clips,
    images,
    demos,
    briefs,
    AdStudioBriefNotFoundError: NotFound,
    AdStudioClipNotFoundError: NotFound,
    AdStudioDemoRecordingNotFoundError: NotFound,
    AdStudioGalleryAssetNotFoundError: NotFound,
    AdStudioGalleryInvalidError: GalleryInvalid,
    AdStudioImageNotFoundError: NotFound,
    AdStudioReferenceNotFoundError: NotFound,
    createAdStudioGalleryAsset: vi.fn(async (params: Record<string, unknown>) => {
      if (!String(params.label ?? '').trim()) throw new GalleryInvalid('label_required');
      const id = String(params.id ?? `gal-${gallery.size + 1}`);
      const row = {
        id,
        organization_id: params.organizationId,
        project_id: params.projectId,
        kind: params.kind,
        source: params.source,
        label: params.label,
        description: params.description,
        gcs_path: params.gcsPath,
        mime_type: params.mimeType,
        byte_size: params.byteSize,
        duration_seconds: params.durationSeconds ?? null,
        created_by: params.actorId,
        created_on: new Date().toISOString(),
      };
      gallery.set(id, row);
      return row;
    }),
    listAdStudioGalleryAssets: vi.fn(async (orgId: string, projectId: string) =>
      [...gallery.values()].filter((r) => r.organization_id === orgId && r.project_id === projectId),
    ),
    getAdStudioGalleryAsset: vi.fn(async (orgId: string, projectId: string, id: string) => {
      const row = gallery.get(id);
      if (!row || row.organization_id !== orgId || row.project_id !== projectId) throw new NotFound();
      return row;
    }),
    updateAdStudioGalleryAsset: vi.fn(async ({ assetId, label, description }: { assetId: string; label?: string; description?: string }) => {
      const row = gallery.get(assetId);
      if (!row) throw new NotFound();
      if (label !== undefined) row.label = label;
      if (description !== undefined) row.description = description;
      return row;
    }),
    deleteAdStudioGalleryAsset: vi.fn(async (orgId: string, projectId: string, id: string) => {
      const row = gallery.get(id);
      if (!row || row.organization_id !== orgId || row.project_id !== projectId) throw new NotFound();
      gallery.delete(id);
      return { gcsPath: String(row.gcs_path) };
    }),
    getAdStudioReference: vi.fn(async (_o: string, _p: string, _b: string, id: string) => {
      const row = refs.get(id);
      if (!row) throw new NotFound();
      return row;
    }),
    listAdStudioReferences: vi.fn(async (_o: string, _p: string, briefId: string) =>
      [...refs.values()].filter((r) => r.brief_id === briefId),
    ),
    createAdStudioReference: vi.fn(async (params: Record<string, unknown>) => {
      const id = `ref-${refs.size + 1}`;
      const row = {
        id,
        organization_id: params.organizationId,
        project_id: params.projectId,
        brief_id: params.briefId,
        source: params.source ?? 'upload',
        label: params.label,
        description: params.description ?? '',
        status: 'uploading',
        gcs_path: null,
        mime_type: null,
        byte_size: null,
        created_by: params.actorId,
        created_on: new Date().toISOString(),
      };
      refs.set(id, row);
      return row;
    }),
    markAdStudioReferenceReady: vi.fn(async (ref: { id: string }, { gcsPath, mimeType, byteSize }: { gcsPath: string; mimeType: string; byteSize: number }) => {
      const row = refs.get(ref.id) ?? ref;
      Object.assign(row, { status: 'ready', gcs_path: gcsPath, mime_type: mimeType, byte_size: byteSize });
      return row;
    }),
    getAdStudioClip: vi.fn(async (_o: string, _p: string, _b: string, id: string) => {
      const row = clips.get(id);
      if (!row) throw new NotFound();
      return row;
    }),
    listAdStudioClips: vi.fn(async (_o: string, _p: string, briefId: string) =>
      [...clips.values()].filter((c) => c.brief_id === briefId),
    ),
    createAdStudioClip: vi.fn(async (params: Record<string, unknown>) => {
      const id = `clip-${clips.size + 1}`;
      const row = {
        id,
        organization_id: params.organizationId,
        project_id: params.projectId,
        brief_id: params.briefId,
        scene_id: params.sceneId,
        version: clips.size + 1,
        kind: params.kind,
        status: 'generating',
        scene_fingerprint: params.sceneFingerprint,
        duration_seconds: params.durationSeconds,
        prompt: params.prompt,
        chosen: false,
        gcs_path: null,
        requested_on: new Date().toISOString(),
      };
      clips.set(id, row);
      return row;
    }),
    markAdStudioClipReady: vi.fn(async (clip: { id: string }, { gcsPath }: { gcsPath: string }) => {
      const row = clips.get(clip.id) ?? clip;
      Object.assign(row, { status: 'ready', gcs_path: gcsPath, completed_on: new Date().toISOString() });
      return row;
    }),
    markAdStudioClipFailed: vi.fn(async (clip: { id: string }, reason: string) => {
      const row = clips.get(clip.id) ?? clip;
      Object.assign(row, { status: 'failed', failure_reason: reason });
      return row;
    }),
    chooseAdStudioClip: vi.fn(async (_o: string, _p: string, _b: string, id: string) => {
      const row = clips.get(id);
      if (!row) throw new NotFound();
      for (const other of clips.values()) {
        if (other.scene_id === row.scene_id) other.chosen = other.id === id;
      }
      return row;
    }),
    getAdStudioImage: vi.fn(async (_o: string, _p: string, _b: string, id: string) => {
      const row = images.get(id);
      if (!row) throw new NotFound();
      return row;
    }),
    listAdStudioImages: vi.fn(async (_o: string, _p: string, briefId: string) =>
      [...images.values()].filter((i) => i.brief_id === briefId),
    ),
    createAdStudioImage: vi.fn(async (params: Record<string, unknown>) => {
      const id = `img-${images.size + 1}`;
      const row = {
        id,
        organization_id: params.organizationId,
        project_id: params.projectId,
        brief_id: params.briefId,
        concept_id: params.conceptId,
        image_format: params.format,
        kind: params.kind,
        version: 1,
        status: 'generating',
        selected: false,
        concept_fingerprint: params.conceptFingerprint,
        prompt: params.prompt,
        provider: params.provider,
        model: params.model,
        requested_on: new Date().toISOString(),
      };
      images.set(id, row);
      return row;
    }),
    markAdStudioImageReady: vi.fn(async (img: { id: string }, { gcsPath, mimeType, basePath }: { gcsPath: string; mimeType: string; basePath?: string | null }) => {
      const row = images.get(img.id) ?? img;
      Object.assign(row, {
        status: 'ready',
        selected: true,
        gcs_path: gcsPath,
        mime_type: mimeType,
        base_path: basePath ?? null,
        completed_on: new Date().toISOString(),
      });
      return row;
    }),
    markAdStudioImageFailed: vi.fn(async (img: { id: string }, { code }: { code: string }) => {
      const row = images.get(img.id) ?? img;
      Object.assign(row, { status: 'failed', failure_code: code });
      return row;
    }),
    getAdStudioDemoRecording: vi.fn(async (_o: string, _p: string, id: string) => {
      const row = demos.get(id);
      if (!row) throw new NotFound();
      return row;
    }),
    listAdStudioDemoRecordings: vi.fn(async () => [...demos.values()]),
    getAdStudioBrief: vi.fn(async (_o: string, _p: string, id: string) => {
      const row = briefs.get(id);
      if (!row) throw new NotFound();
      return row;
    }),
    saveAdStudioScript: vi.fn(async ({ briefId, scenes }: { briefId: string; scenes: unknown[] }) => {
      const row = briefs.get(briefId);
      if (!row) throw new NotFound();
      row.scenes = scenes;
      return row;
    }),
    saveAdStudioImageConcepts: vi.fn(async ({ briefId, concepts }: { briefId: string; concepts: unknown[] }) => {
      const row = briefs.get(briefId);
      if (!row) throw new NotFound();
      row.image_concepts = concepts;
      return row;
    }),
    newAdStudioSceneId: vi.fn(() => `concept-${Math.random().toString(36).slice(2, 8)}`),
    getAdStudioBrandKit: vi.fn(async () => ({
      brandName: 'TestBrand',
      slogan: '',
      toneOfVoice: '',
      avoidWords: [],
      colors: ['#112233'],
      logo: null,
    })),
    getAdStudioAdvertiserName: vi.fn(async () => 'TestBrand'),
    assertAdStudioQuota: vi.fn(),
    recordAdStudioUsage: vi.fn(),
  };
});

vi.mock('@growthos/firebase-orm-models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@growthos/firebase-orm-models')>();
  return {
    ...actual,
    ...orm,
    connectToFirestore: vi.fn(async () => undefined),
    getORMStatus: vi.fn(() => ({ connected: true })),
  };
});

import {
  AdStudioGalleryRequestError,
  addUploadedGalleryAsset,
  attachImageToBriefScene,
  listAllProjectMediaSources,
  listProjectGallery,
  normalizeUploadedImage,
  normalizeVideoClipForScene,
  removeGalleryAsset,
  resolveGallerySource,
  useCustomClipForScene,
  useCustomImageForBrief,
} from './index';

const ctx = { organizationId: 'org-1', projectId: 'proj-1', actorId: 'user-1' };

function fakeMp4Bytes(): Buffer {
  // Valid ISO BMFF box header ('ftypisom')
  return Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypisom\x00\x00\x02\x00isommp41')]);
}

async function samplePng(width = 160, height = 100): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 24, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
}

async function sampleWebp(): Promise<Buffer> {
  return sharp({
    create: { width: 160, height: 100, channels: 3, background: { r: 220, g: 80, b: 40 } },
  })
    .webp()
    .toBuffer();
}

describe('ad-studio gallery & custom media insertion', () => {
  beforeEach(() => {
    configureAdStudioRuntime({
      normalizeVideo: async ({ bytes }) => bytes,
    });
    orm.gallery.clear();
    orm.refs.clear();
    orm.clips.clear();
    orm.images.clear();
    orm.demos.clear();
    orm.briefs.clear();
    vi.clearAllMocks();
    orm.briefs.set('brief-1', {
      id: 'brief-1',
      organization_id: 'org-1',
      project_id: 'proj-1',
      name: 'Launch Ad',
      objective: 'signups',
      product_description: 'CRM for teams',
      landing_page_url: 'https://app.example.com',
      video_format: 'vertical',
      language: 'en',
      target_seconds: 15,
      video_settings: { resolution: '720p' },
      scenes: [
        { id: 'scene-1', visualPrompt: 'Team dashboard', voiceover: 'Meet your dashboard', durationSeconds: 5 },
      ],
      image_concepts: [
        { id: 'c1', visualPrompt: 'Hero screen', headline: 'Faster Billing', formats: ['square', 'portrait'] },
      ],
    });
  });

  afterEach(() => {
    resetAdStudioRuntime();
  });

  it('normalizes PNG, JPEG, and WEBP uploads and rejects non-images or oversized files', async () => {
    const webp = await sampleWebp();
    const out = await normalizeUploadedImage(webp, { width: 1080, height: 1080 });
    expect(out.mimeType).toBe('image/png');
    const meta = await sharp(out.bytes).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);

    await expect(normalizeUploadedImage(Buffer.from('not-an-image'))).rejects.toMatchObject({
      code: 'unsupported_media',
    });
    const oversized = Buffer.alloc(13 * 1024 * 1024, 0);
    await expect(normalizeUploadedImage(oversized)).rejects.toThrow(AdStudioGalleryRequestError);
  });

  it('adds, lists, resolves, and deletes gallery assets and walkthrough frames', async () => {
    const storage = createMemoryMediaStorage();
    const png = await samplePng();
    const imgAsset = await addUploadedGalleryAsset(
      ctx,
      { bytes: png, fileName: 'hero-screen.png', description: 'Main dashboard' },
      { storage },
    );
    expect(imgAsset.kind).toBe('image');
    expect(imgAsset.label).toBe('hero screen');

    const mp4 = fakeMp4Bytes();
    const vidAsset = await addUploadedGalleryAsset(
      ctx,
      { bytes: mp4, fileName: 'product-clip.mp4' },
      { storage },
    );
    expect(vidAsset.kind).toBe('video');
    expect(vidAsset.mime_type).toBe('video/mp4');

    const items = await listProjectGallery(ctx);
    expect(items).toHaveLength(2);

    orm.demos.set('rec-1', {
      id: 'rec-1',
      organization_id: 'org-1',
      project_id: 'proj-1',
      status: 'ready',
      gcs_path: 'orgs/org-1/projects/proj-1/demo/rec-1.mp4',
      segments: [
        {
          id: 'seg-1',
          title: 'Reports page',
          description: 'Live analytics chart',
          start_seconds: 2,
          end_seconds: 6,
          selected: true,
          frame_gcs_path: 'orgs/org-1/projects/proj-1/demo-recordings/rec-1/segment-seg-1.jpg',
        },
      ],
    });
    await storage.upload('orgs/org-1/projects/proj-1/demo-recordings/rec-1/segment-seg-1.jpg', png, 'image/jpeg');
    await storage.upload('orgs/org-1/projects/proj-1/demo/rec-1.mp4', mp4, 'video/mp4');

    const segImg = await resolveGallerySource(ctx, { type: 'demo_segment', recordingId: 'rec-1', segmentId: 'seg-1' }, 'image', { storage });
    expect(segImg.kind).toBe('image');
    expect(segImg.label).toBe('Reports page');

    const segVid = await resolveGallerySource(ctx, { type: 'demo_segment', recordingId: 'rec-1', segmentId: 'seg-1' }, 'video', { storage });
    expect(segVid.kind).toBe('video');
    expect(segVid.startSeconds).toBe(2);
    expect(segVid.endSeconds).toBe(6);

    const allSources = await listAllProjectMediaSources({ ...ctx, briefId: 'brief-1' });
    expect(allSources.some((s) => s.source === 'walkthrough' && s.kind === 'video')).toBe(true);
    expect(allSources.some((s) => s.source === 'walkthrough' && s.kind === 'image')).toBe(true);

    await removeGalleryAsset({ ...ctx, assetId: String(imgAsset.id) }, storage);
    expect(await listProjectGallery(ctx)).toHaveLength(1);
    expect(storage.objects.has(String(imgAsset.gcs_path))).toBe(false);
  });

  it('inserts an uploaded or gallery video clip directly into a scene with 0 AI quota', async () => {
    const storage = createMemoryMediaStorage();
    const mp4 = fakeMp4Bytes();
    const clip = await useCustomClipForScene(
      {
        ...ctx,
        briefId: 'brief-1',
        sceneId: 'scene-1',
        upload: { bytes: mp4, fileName: 'intro-demo.mp4' },
        alsoSaveToGallery: true,
      },
      { storage },
    );
    expect(clip.kind).toBe('upload');
    expect(clip.chosen).toBe(true);
    expect(storage.objects.has(String(clip.gcs_path))).toBe(true);
    expect(orm.assertAdStudioQuota).not.toHaveBeenCalled();
    expect(orm.gallery.size).toBe(1);
  });

  it('attaches an uploaded image to a brief scene as a screen reference and saves script', async () => {
    const storage = createMemoryMediaStorage();
    const webp = await sampleWebp();
    const res = await attachImageToBriefScene(
      {
        ...ctx,
        briefId: 'brief-1',
        sceneId: 'scene-1',
        upload: { bytes: webp, fileName: 'mobile-app.webp' },
        use: 'screen',
        alsoSaveToGallery: true,
      },
      { storage },
    );
    expect(res.reference.status).toBe('ready');
    expect(res.scenes[0]?.references).toEqual([{ imageId: res.reference.id, use: 'screen' }]);
    expect(orm.gallery.size).toBe(1);
  });

  it('creates an image ad placement from a photo upload or gallery item without using AI quota', async () => {
    const storage = createMemoryMediaStorage();
    const png = await samplePng();
    const { image } = await useCustomImageForBrief(
      {
        ...ctx,
        briefId: 'brief-1',
        conceptId: 'c1',
        format: 'square',
        upload: { bytes: png, fileName: 'product.png' },
        alsoSaveToGallery: true,
      },
      { storage },
    );
    expect(image.kind).toBe('upload');
    expect(image.selected).toBe(true);
    expect(image.status).toBe('ready');
    expect(orm.assertAdStudioQuota).not.toHaveBeenCalled();

    const asset = [...orm.gallery.values()][0];
    const newConceptRes = await useCustomImageForBrief(
      {
        ...ctx,
        briefId: 'brief-1',
        format: 'story',
        source: { type: 'gallery', assetId: String(asset.id) },
        headline: 'Save Hours Today',
      },
      { storage },
    );
    expect(newConceptRes.brief.image_concepts).toHaveLength(2);
    expect(newConceptRes.image.format).toBe('story');
    expect(newConceptRes.image.kind).toBe('upload');
  });

  it('normalizes video clip with the runtime seam when available', async () => {
    configureAdStudioRuntime({
      normalizeVideo: async ({ bytes }) => Buffer.concat([bytes, Buffer.from('norm')]),
    });
    const out = await normalizeVideoClipForScene({ bytes: fakeMp4Bytes(), aspectRatio: '9:16', durationSeconds: 4 });
    expect(out.mimeType).toBe('video/mp4');
    expect(out.durationSeconds).toBe(4);
    expect(out.bytes.toString()).toContain('norm');
  });
});
