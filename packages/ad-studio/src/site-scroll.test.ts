// @vitest-environment node
import { writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { sceneFingerprint } from '@growthos/shared';
import { createMemoryMediaStorage } from './media-storage';
import { configureAdStudioRuntime, resetAdStudioRuntime } from './runtime';

const orm = vi.hoisted(() => {
  const briefs = new Map<string, Record<string, unknown>>();
  const clips = new Map<string, Record<string, unknown>>();
  const videos = new Map<string, Record<string, unknown>>();
  const gallery = new Map<string, Record<string, unknown>>();
  const demos = new Map<string, Record<string, unknown>>();

  class NotFound extends Error {}

  return {
    briefs,
    clips,
    videos,
    gallery,
    demos,
    AdStudioBriefNotFoundError: NotFound,
    getAdStudioBrief: vi.fn(async (_o: string, _p: string, id: string) => {
      const row = briefs.get(id);
      if (!row) throw new NotFound();
      return row;
    }),
    saveAdStudioBriefSitePages: vi.fn(async ({ briefId, sitePages, landingPageUrl }: { briefId: string; sitePages: unknown[]; landingPageUrl?: string | null }) => {
      const row = briefs.get(briefId);
      if (!row) throw new NotFound();
      row.site_pages = sitePages;
      if (landingPageUrl !== undefined) row.landing_page_url = landingPageUrl;
      return row;
    }),
    updateAdStudioBriefSitePageSelection: vi.fn(async ({ briefId, selectedPageIds }: { briefId: string; selectedPageIds: readonly string[] }) => {
      const row = briefs.get(briefId);
      if (!row) throw new NotFound();
      const picked = new Set(selectedPageIds);
      row.site_pages = ((row.site_pages as Record<string, unknown>[] | null) ?? []).map((entry) => ({
        ...entry,
        selected: picked.has(String(entry.id)),
      }));
      return row;
    }),
    createAdStudioGalleryAsset: vi.fn(async (params: Record<string, unknown>) => {
      const id = `gal-${gallery.size + 1}`;
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
        async save() {
          gallery.set(id, this);
        },
      };
      gallery.set(id, row);
      return row;
    }),
    listAdStudioGalleryAssets: vi.fn(async () => [...gallery.values()]),
    getAdStudioGalleryAsset: vi.fn(async (_o: string, _p: string, id: string) => {
      const row = gallery.get(id);
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
        model: params.model,
        chosen: false,
        gcs_path: null,
        requested_by: params.requestedBy,
        requested_on: new Date().toISOString(),
        completed_on: null,
        narration_text: (params.narration as { text?: string } | null)?.text ?? null,
        narration_voice: (params.narration as { voice?: string } | null)?.voice ?? null,
        narration_style: (params.narration as { style?: string } | null)?.style ?? null,
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
    recordAdStudioClipQa: vi.fn(async (clip: { id: string }, result: Record<string, unknown>) => {
      const row = clips.get(clip.id) ?? clip;
      Object.assign(row, {
        qa_status: result.status,
        qa_issues: result.issues,
        qa_transcript: result.transcript,
        qa_model: result.model,
        qa_checked_on: new Date().toISOString(),
      });
      return row;
    }),
    listAdStudioVideos: vi.fn(async (_o: string, _p: string, briefId: string) =>
      [...videos.values()].filter((v) => v.brief_id === briefId),
    ),
    createAdStudioVideo: vi.fn(async (params: Record<string, unknown>) => {
      const id = `vid-${videos.size + 1}`;
      const row = {
        id,
        organization_id: params.organizationId,
        project_id: params.projectId,
        brief_id: params.briefId,
        clip_ids: params.clipIds,
        scene_ids: params.sceneIds,
        aspect_ratio: params.aspectRatio,
        status: 'assembling',
        failure_reason: null,
        duration_seconds: params.durationSeconds,
        gcs_path: null,
        requested_by: params.requestedBy,
        requested_on: new Date().toISOString(),
        assembled_on: null,
        demo_segments: params.demoSegments ?? null,
      };
      videos.set(id, row);
      return row;
    }),
    markAdStudioVideoReady: vi.fn(async (video: { id: string }, params: { gcsPath: string; durationSeconds: number }) => {
      const row = videos.get(video.id) ?? video;
      Object.assign(row, {
        status: 'ready',
        gcs_path: params.gcsPath,
        duration_seconds: params.durationSeconds,
        assembled_on: new Date().toISOString(),
      });
      return row;
    }),
    markAdStudioVideoFailed: vi.fn(async (video: { id: string }, reason: string) => {
      const row = videos.get(video.id) ?? video;
      Object.assign(row, { status: 'failed', failure_reason: reason });
      return row;
    }),
    listAdStudioDemoRecordings: vi.fn(async () => [...demos.values()]),
    getAdStudioBrandKit: vi.fn(async () => ({
      brandName: 'Easy Sign',
      slogan: '',
      toneOfVoice: '',
      avoidWords: [],
      colors: ['#112233'],
      logo: null,
    })),
    getAdStudioSettings: vi.fn(async () => ({
      dailyTextGenerations: 20,
      dailyVideoSeconds: 300,
      dailyImages: 30,
      videoQa: { enabled: false, retries: 0 },
      imageSize: '1K',
      videoBrandBanner: false,
      customized: false,
      lastChangedOn: null,
    })),
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
  AdStudioSiteScrollError,
  scanBriefSitePages,
  setBriefSitePageSelection,
  useScrollClipForScene,
  type SitePageCapturer,
} from './site-scroll';
import { assembleBriefVideo } from './video-pipeline';
import { defaultFfmpegRunner } from './ffmpeg';

const ctx = {
  organizationId: 'org-1',
  projectId: 'proj-1',
  briefId: 'brief-1',
  actorId: 'user-1',
};

const SCENES = [
  { id: 'scene-1', visualPrompt: 'Opening hook', voiceover: '', onScreenText: '', durationSeconds: 5 },
  { id: 'scene-2', visualPrompt: 'Closing offer', voiceover: '', onScreenText: '', durationSeconds: 5 },
];

function fakeMp4(tag: string): Buffer {
  return Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from(`ftypisom-${tag}`)]);
}

async function tallPng(): Promise<Buffer> {
  return sharp({
    create: { width: 430, height: 1800, channels: 3, background: { r: 245, g: 247, b: 252 } },
  })
    .png()
    .toBuffer();
}

describe('ad-studio site scroll capture & video integration', () => {
  beforeEach(() => {
    orm.briefs.clear();
    orm.clips.clear();
    orm.videos.clear();
    orm.gallery.clear();
    orm.demos.clear();
    vi.clearAllMocks();

    orm.briefs.set('brief-1', {
      id: 'brief-1',
      organization_id: 'org-1',
      project_id: 'proj-1',
      name: 'Digital Signature Ad',
      objective: 'More contracts signed online',
      product_description: 'Fast e-signature plans and team pricing for businesses',
      landing_page_url: 'https://easysign.example.com',
      video_format: 'vertical',
      language: 'en',
      target_seconds: 20,
      video_settings: { resolution: '720p' },
      scenes: SCENES,
      site_pages: null,
    });
  });

  afterEach(() => {
    resetAdStudioRuntime();
  });

  it('scans homepage + relevant product pages without credentials, renders scroll videos, and saves to gallery', async () => {
    const storage = createMemoryMediaStorage();
    const png = await tallPng();
    const capturer: SitePageCapturer = vi.fn(async ({ urls }) =>
      urls.map((url) => ({
        url,
        title: url.includes('pricing') ? 'Pricing Plans' : 'Easy Sign Home',
        screenshot: png,
        links: url === 'https://easysign.example.com/' || url === 'https://easysign.example.com'
          ? [
              { url: 'https://easysign.example.com/privacy', text: 'Privacy Policy' },
              { url: 'https://easysign.example.com/products/signatures', text: 'E-Signature Solution' },
              { url: 'https://easysign.example.com/pricing', text: 'Pricing Plans' },
            ]
          : [],
      })),
    );
    const renderScrollingVideo = vi.fn(async ({ output, durationSeconds }: { output: string; durationSeconds: number }) => {
      await writeFile(output, fakeMp4(`scroll-${durationSeconds}`));
      return { durationSeconds };
    });
    configureAdStudioRuntime({
      demoAddressCheck: async () => undefined,
      sitePageCapturer: capturer,
      renderScrollingVideo,
    });

    const pages = await scanBriefSitePages(ctx, { storage });
    expect(pages.length).toBe(3);
    expect(pages[0]?.kind).toBe('home');
    expect(pages.some((p) => p.url.includes('/products/signatures') || p.url.includes('/pricing'))).toBe(true);
    expect(pages.some((p) => p.url.includes('/privacy'))).toBe(false);
    expect(pages.filter((p) => p.selected)).toHaveLength(2);
    expect(pages[0]?.screenshotUrl).toMatch(/\/site-pages\/.*\/media\?kind=image$/);
    expect(pages[0]?.videoUrl).toMatch(/\/site-pages\/.*\/media\?kind=video$/);

    // Every page uploaded both full-page screenshot PNG and scrolling MP4 + best-effort gallery item.
    const storedKeys = [...storage.objects.keys()];
    expect(storedKeys.filter((k) => k.includes('/site-pages/') && k.endsWith('.png'))).toHaveLength(3);
    expect(storedKeys.filter((k) => k.includes('/site-pages/') && k.endsWith('.mp4'))).toHaveLength(3);
    expect(orm.gallery.size).toBe(3);
    expect([...orm.gallery.values()].every((item) => item.source === 'walkthrough')).toBe(true);

    // Update selection to keep only the second page selected.
    const updated = await setBriefSitePageSelection({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      briefId: ctx.briefId,
      selectedPageIds: [pages[1]!.id],
    });
    expect(updated.map((p) => p.selected)).toEqual([false, true, false]);
  });

  it('rejects invalid URLs and private/blocked addresses', async () => {
    const storage = createMemoryMediaStorage();
    await expect(scanBriefSitePages({ ...ctx, siteUrl: 'not a url' }, { storage })).rejects.toMatchObject({
      code: 'invalid_url',
    });
    let caught: unknown;
    try {
      await scanBriefSitePages({ ...ctx, siteUrl: 'https://127.0.0.1/admin' }, { storage });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AdStudioSiteScrollError);
    expect((caught as AdStudioSiteScrollError).code).toBe('address_blocked');
  });

  it('turns a scanned page, gallery image, or uploaded screenshot into a scene clip with 0 AI quota and optional TTS', async () => {
    const storage = createMemoryMediaStorage();
    const png = await tallPng();
    configureAdStudioRuntime({
      demoAddressCheck: async () => undefined,
      sitePageCapturer: async ({ urls }) =>
        urls.map((url) => ({
          url,
          title: 'Product Overview',
          screenshot: png,
          links: [],
        })),
      renderScrollingVideo: async ({ output, durationSeconds }) => {
        await writeFile(output, fakeMp4('rendered'));
        return { durationSeconds };
      },
      mixNarration: async ({ output }) => {
        await writeFile(output, fakeMp4('narrated'));
      },
    });

    const pages = await scanBriefSitePages(ctx, { storage });

    // (a) From scanned page
    const fromPage = await useScrollClipForScene({ ...ctx, sceneId: 'scene-1' }, { sitePageId: pages[0]!.id }, { storage });
    expect(fromPage.clip.kind).toBe('upload');
    expect(fromPage.clip.chosen).toBe(true);
    expect(orm.assertAdStudioQuota).not.toHaveBeenCalled();

    // (b) From uploaded tall PNG on a voice-over scene with TTS mix
    const brief = orm.briefs.get('brief-1')!;
    brief.scenes = [
      SCENES[0],
      { ...SCENES[1], voiceover: 'Sign documents in ten seconds flat.' },
    ];
    const tts = {
      model: 'gemini-3.8-flash-tts',
      synthesize: vi.fn(async () => Buffer.from('RIFF-fake-wav')),
    };
    const fromUpload = await useScrollClipForScene(
      { ...ctx, sceneId: 'scene-2' },
      { bytes: png, fileName: 'landing-full.png', alsoSaveToGallery: true },
      { storage, tts },
    );
    expect(fromUpload.clip.chosen).toBe(true);
    expect(tts.synthesize).toHaveBeenCalledTimes(1);
    const clipRecord = orm.clips.get(fromUpload.clip.id)!;
    expect(storage.objects.get(String(clipRecord.gcs_path))?.data.toString()).toContain('ftypisom-narrated');
    // Saved to gallery alongside scanned page screenshot.
    expect(orm.gallery.size).toBe(2);

    // (c) From gallery asset ID
    const galleryItem = [...orm.gallery.values()][0]!;
    const fromGallery = await useScrollClipForScene(
      { ...ctx, sceneId: 'scene-1' },
      { source: { type: 'gallery', assetId: String(galleryItem.id) } },
      { storage },
    );
    expect(fromGallery.clip.status).toBe('ready');
  });

  it('auto-scans the site when assembling without demo walkthroughs and splices scrolling clips after the hook', async () => {
    const storage = createMemoryMediaStorage();
    const png = await tallPng();
    const concatSpy = vi.fn(async ({ output }: { clips: readonly { file: string; seconds: number }[]; output: string }) => {
      await writeFile(output, fakeMp4('final-assembled'));
      return { durationSeconds: 18 };
    });

    configureAdStudioRuntime({
      demoAddressCheck: async () => undefined,
      sitePageCapturer: async ({ urls }) =>
        urls.map((url) => ({
          url,
          title: url.includes('features') ? 'Features' : 'Home',
          screenshot: png,
          links:
            url === 'https://easysign.example.com' || url === 'https://easysign.example.com/'
              ? [{ url: 'https://easysign.example.com/features', text: 'Online signature features' }]
              : [],
        })),
      renderScrollingVideo: async ({ output, durationSeconds }) => {
        await writeFile(output, fakeMp4('scroll-page'));
        return { durationSeconds };
      },
      concatClips: concatSpy,
    });

    // Seed ready current clips for both scenes.
    const brief = orm.briefs.get('brief-1')!;
    const vCtx = { format: 'vertical' as const, language: 'en', voice: null, settings: brief.video_settings as { resolution: '720p' } };
    for (let i = 0; i < SCENES.length; i += 1) {
      const scene = SCENES[i]!;
      const clipId = `ready-clip-${i + 1}`;
      const clipPath = `orgs/org-1/projects/proj-1/ad-studio/brief-1/clips/${clipId}.mp4`;
      await storage.upload(clipPath, fakeMp4(`scene-${i + 1}`), 'video/mp4');
      orm.clips.set(clipId, {
        id: clipId,
        organization_id: 'org-1',
        project_id: 'proj-1',
        brief_id: 'brief-1',
        scene_id: scene.id,
        version: 1,
        kind: 'render',
        status: 'ready',
        scene_fingerprint: sceneFingerprint(scene, vCtx),
        duration_seconds: scene.durationSeconds,
        prompt: scene.visualPrompt,
        chosen: true,
        gcs_path: clipPath,
        requested_on: '2026-11-18T00:00:00.000Z',
        completed_on: '2026-11-18T00:00:05.000Z',
      });
    }

    const assembled = await assembleBriefVideo(ctx, { storage, runner: defaultFfmpegRunner() });
    expect(assembled.status).toBe('ready');
    expect(concatSpy).toHaveBeenCalledTimes(1);

    const passedClips = concatSpy.mock.calls[0]?.[0]?.clips ?? [];
    // Scene 1 -> site-scroll page 1 -> site-scroll page 2 -> Scene 2
    expect(passedClips).toHaveLength(4);
    expect(passedClips[1]?.file).toContain('site-scroll-');
    expect(passedClips[2]?.file).toContain('site-scroll-');
    expect(passedClips[3]?.file).not.toContain('site-scroll-');
  });
});
