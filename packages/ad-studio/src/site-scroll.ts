import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod/v4';
import {
  AD_STUDIO_ASPECT_RATIO,
  AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES,
  AD_STUDIO_SITE_PAGE_KINDS,
  AD_STUDIO_SITE_SCROLL_DEFAULT_SECONDS,
  AD_STUDIO_SITE_SCROLL_MAX_PAGES,
  formatHostAndPath,
  galleryLabelFromFileName,
  isWebpBytes,
  languageName,
  narrationIsSeparate,
  normalizeSitePageUrl,
  normalizeVideoSettings,
  rankCandidateSitePages,
  sceneFingerprint,
  sniffReferenceMimeType,
  spokenNarration,
  ttsNarrationStyle,
  ttsVoiceName,
  voiceDescription,
  type AdStudioFormat,
  type AdStudioGallerySourceRef,
  type AdStudioSitePageKind,
  type AdStudioSiteScrollPage,
  type AdStudioSiteScrollPageView,
} from '@growthos/shared';
import {
  assertPublicHttpsUrl,
  chooseAdStudioClip,
  createAdStudioClip,
  createAdStudioGalleryAsset,
  getAdStudioBrief,
  listAdStudioClips,
  listAdStudioVideos,
  markAdStudioClipFailed,
  markAdStudioClipReady,
  recordAdStudioClipQa,
  saveAdStudioBriefSitePages,
  updateAdStudioBriefSitePageSelection,
  type AdStudioBriefModel,
} from '@growthos/firebase-orm-models';
import { chromiumPath } from './demo-browser';
import { cachedAddressCheck, decideDemoRequest, siteOf } from './demo-policy';
import {
  defaultFfmpegRunner,
  FfmpegFailedError,
  FfmpegUnavailableError,
  mixNarration,
  renderScrollingPageVideo,
  type FfmpegRunner,
} from './ffmpeg';
import { AdStudioGalleryRequestError, resolveGallerySource } from './gallery';
import type { AdStudioLlm } from './llm';
import {
  adStudioClipObjectPath,
  adStudioGalleryObjectPath,
  adStudioSitePageScreenshotObjectPath,
  adStudioSitePageVideoObjectPath,
  readAdStudioObject,
  resolveAdStudioMediaStorage,
  type AdStudioMediaStorage,
} from './media-storage';
import { adStudioRuntime, ensureOrm } from './runtime';
import type { AdStudioTts } from './tts';
import { toAdStudioClipView, toAdStudioVideoView } from './video-pipeline';
import type { AdStudioClipView, AdStudioVideoView } from './view';

const PAGE_NAVIGATION_TIMEOUT_MS = 25_000;
const PAGE_SETTLE_TIMEOUT_MS = 6_000;
const MAX_CAPTURE_VIEWPORTS = 4;

export type AdStudioSiteScrollErrorCode =
  | 'invalid_url'
  | 'address_blocked'
  | 'site_unreachable'
  | 'browser_unavailable'
  | 'ffmpeg_unavailable'
  | 'ffmpeg_failed'
  | 'page_not_found';

const SITE_SCROLL_ERROR_MESSAGES: Record<AdStudioSiteScrollErrorCode, string> = {
  invalid_url: 'Enter a valid public website URL starting with https://.',
  address_blocked: 'That website address cannot be scanned because it points to a private or blocked host.',
  site_unreachable: 'The website did not respond when scanning pages for screenshots.',
  browser_unavailable: 'Website page capture is unavailable on this server right now.',
  ffmpeg_unavailable: 'Video processing is unavailable on this server right now.',
  ffmpeg_failed: 'Creating the scrolling page video failed.',
  page_not_found: 'The requested page or scene could not be found.',
};

/** Rejected website scan or scrolling video request, translated cleanly by `http.ts`. */
export class AdStudioSiteScrollError extends Error {
  constructor(
    public readonly code: AdStudioSiteScrollErrorCode,
    message: string = SITE_SCROLL_ERROR_MESSAGES[code],
  ) {
    super(message);
    this.name = 'AdStudioSiteScrollError';
  }
}

export interface SitePageCaptureResult {
  url: string;
  title: string;
  screenshot: Buffer;
  links: { url: string; text: string }[];
}

export type SitePageCapturer = (params: {
  urls: readonly string[];
  format: AdStudioFormat;
  discoverLinksOnFirst?: boolean;
  allowRequest: (req: { url: string; method: string; isNavigation: boolean }) => Promise<boolean>;
}) => Promise<SitePageCaptureResult[]>;

export function toAdStudioSiteScrollPageView(
  organizationId: string,
  projectId: string,
  briefId: string,
  page: AdStudioSiteScrollPage,
): AdStudioSiteScrollPageView {
  const mediaBase = `/api/orgs/${organizationId}/projects/${projectId}/ad-studio/briefs/${briefId}/site-pages/${encodeURIComponent(page.id)}/media`;
  return {
    id: page.id,
    url: page.url,
    hostAndPath: formatHostAndPath(page.url),
    title: page.title,
    kind: page.kind,
    relevanceReason: page.relevanceReason,
    screenshotUrl: `${mediaBase}?kind=image`,
    videoUrl: `${mediaBase}?kind=video`,
    durationSeconds: page.durationSeconds,
    selected: page.selected,
    capturedOn: page.capturedOn,
  };
}

function lockInteractiveElements(): void {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  window.addEventListener('submit', stop, true);
  window.addEventListener('beforeinput', stop, true);
}

/**
 * Default Playwright-based capturer for public landing and product pages. Uses Chromium to scroll
 * through lazy-loaded sections and snap a sharp multi-viewport full-page PNG without credentials.
 */
export function createPlaywrightSitePageCapturer(env: NodeJS.ProcessEnv = process.env): SitePageCapturer {
  return async ({ urls, format, discoverLinksOnFirst, allowRequest }) => {
    let chromiumModule: typeof import('playwright-core');
    try {
      chromiumModule = await import('playwright-core');
    } catch {
      throw new AdStudioSiteScrollError('browser_unavailable');
    }

    const configuredPath = chromiumPath(env);
    let browser: Awaited<ReturnType<typeof chromiumModule.chromium.launch>>;
    try {
      browser = await chromiumModule.chromium.launch({
        ...(existsSync(configuredPath) ? { executablePath: configuredPath } : {}),
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--mute-audio',
          '--no-first-run',
          '--disable-extensions',
          '--disable-background-networking',
        ],
      });
    } catch {
      throw new AdStudioSiteScrollError('browser_unavailable');
    }

    const viewport = format === 'vertical' ? { width: 430, height: 932 } : { width: 1280, height: 720 };
    const deviceScaleFactor = format === 'vertical' ? 2 : 1.5;

    try {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor,
        serviceWorkers: 'block',
        acceptDownloads: false,
        javaScriptEnabled: true,
      });
      await context.route('**/*', async (route) => {
        const request = route.request();
        const isNavigation = request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame();
        const ok = await allowRequest({ url: request.url(), method: request.method(), isNavigation }).catch(() => false);
        await (ok ? route.continue() : route.abort('blockedbyclient')).catch(() => undefined);
      });
      await context.routeWebSocket(/.*/, async (socket) => {
        const target = socket.url().replace(/^wss:/i, 'https:');
        const ok = target.startsWith('https:') && (await allowRequest({ url: target, method: 'GET', isNavigation: false }).catch(() => false));
        if (ok) socket.connectToServer();
        else await socket.close().catch(() => undefined);
      });

      const page = await context.newPage();
      page.setDefaultTimeout(PAGE_NAVIGATION_TIMEOUT_MS);
      page.on('dialog', (dialog) => void dialog.dismiss().catch(() => undefined));
      await context.addInitScript(lockInteractiveElements);

      const results: SitePageCaptureResult[] = [];
      for (let index = 0; index < urls.length; index += 1) {
        const targetUrl = urls[index];
        try {
          const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_NAVIGATION_TIMEOUT_MS });
          if (!response || response.status() >= 400) continue;
          await page.waitForLoadState('networkidle', { timeout: PAGE_SETTLE_TIMEOUT_MS }).catch(() => undefined);
          await page.keyboard.press('Escape').catch(() => undefined);

          // Step down the page briefly so lazy images and reveal animations render before capture.
          const totalHeight = await page.evaluate(() => Math.max(document.body?.scrollHeight ?? 0, document.documentElement?.scrollHeight ?? 0));
          const maxClipHeight = Math.min(Math.max(viewport.height, totalHeight), viewport.height * MAX_CAPTURE_VIEWPORTS);
          for (let y = viewport.height; y < maxClipHeight; y += viewport.height) {
            await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y).catch(() => undefined);
            await page.waitForTimeout(140);
          }
          await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
          await page.waitForTimeout(160);

          const meta = await page.evaluate(
            (collectLinks) => {
              const title = (document.title || '').replace(/\s+/g, ' ').trim().slice(0, 100);
              if (!collectLinks) return { title, links: [] as { url: string; text: string }[] };
              const rawLinks: { url: string; text: string }[] = [];
              const anchors = Array.from(document.querySelectorAll('a[href]'));
              for (const anchor of anchors) {
                if (rawLinks.length >= 80) break;
                const href = (anchor as HTMLAnchorElement).href;
                if (!href) continue;
                const text = ((anchor as HTMLElement).innerText || anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 80);
                rawLinks.push({ url: href, text });
              }
              return { title, links: rawLinks };
            },
            Boolean(discoverLinksOnFirst && index === 0),
          );

          const screenshot = Buffer.from(
            await page.screenshot({
              type: 'png',
              clip: { x: 0, y: 0, width: viewport.width, height: maxClipHeight },
            }),
          );
          results.push({
            url: page.url() || targetUrl,
            title: meta.title || formatHostAndPath(targetUrl),
            screenshot,
            links: meta.links,
          });
        } catch {
          // Skip subpages that time out or refuse rendering; first page missing is checked by caller.
        }
      }
      return results;
    } finally {
      await browser.close().catch(() => undefined);
    }
  };
}

const PagePickSchema = z.object({
  pages: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
        kind: z.enum(AD_STUDIO_SITE_PAGE_KINDS),
        reason: z.string(),
      }),
    )
    .max(AD_STUDIO_SITE_SCROLL_MAX_PAGES),
});

async function refineSelectedPagesWithLlm(params: {
  candidates: ReturnType<typeof rankCandidateSitePages>;
  discoveredLinks: readonly { url: string; text: string }[];
  brief: AdStudioBriefModel;
  llm: AdStudioLlm;
}): Promise<{ url: string; suggestedTitle: string; kind: AdStudioSitePageKind; reason: string }[] | null> {
  if (params.discoveredLinks.length === 0) return null;
  const candidateUrls = new Set(params.discoveredLinks.map((l) => l.url));
  const shortlist = params.discoveredLinks.slice(0, 25);
  try {
    const picked = await params.llm.generateJson({
      schema: PagePickSchema,
      system:
        'You select up to 3 website pages to screenshot and turn into scrolling clips inside a video ad. Include the homepage/start URL plus the most relevant product/offering page(s) matching the ad. Only pick URLs from the supplied list.',
      user: JSON.stringify({
        startUrl: params.candidates[0]?.url,
        adName: params.brief.name,
        productDescription: params.brief.product_description,
        objective: params.brief.objective,
        discoveredLinks: shortlist,
      }),
    });
    const valid = picked.pages.filter((item) => candidateUrls.has(item.url) || params.candidates.some((c) => c.url === item.url));
    if (valid.length === 0) return null;
    return valid.slice(0, AD_STUDIO_SITE_SCROLL_MAX_PAGES).map((item) => ({
      url: item.url,
      suggestedTitle: item.title.trim().slice(0, 80) || formatHostAndPath(item.url),
      kind: item.kind,
      reason: item.reason.trim().slice(0, 140),
    }));
  } catch {
    return null;
  }
}

async function prepareUploadedScrollImage(bytes: Buffer): Promise<{ bytes: Buffer; mimeType: 'image/png' }> {
  if (bytes.length > AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES) {
    throw new AdStudioGalleryRequestError('media_too_large');
  }
  const sniffed = sniffReferenceMimeType(bytes);
  if (!sniffed && !isWebpBytes(bytes)) {
    throw new AdStudioGalleryRequestError('unsupported_media');
  }
  try {
    const out = await sharp(bytes, { failOn: 'error' }).rotate().png().toBuffer();
    return { bytes: out, mimeType: 'image/png' };
  } catch {
    throw new AdStudioGalleryRequestError('unsupported_media');
  }
}

function briefVideoContext(brief: AdStudioBriefModel) {
  return {
    format: brief.video_format,
    language: brief.language,
    voice: voiceDescription(brief.narrator_voice),
    settings: brief.video_settings ?? null,
  };
}

/**
 * Scans the brief's public website without requiring credentials:
 * 1. Captures the landing page / start URL and extracts internal links.
 * 2. Selects the homepage + ad-relevant product pages (deterministically, or refined if `deps.llm` is passed).
 * 3. Captures tall full-page screenshots, renders smooth scrolling MP4 clips, saves screenshots to
 *    the project gallery, and persists the pages onto the brief.
 */
export async function scanBriefSitePages(
  ctx: {
    organizationId: string;
    projectId: string;
    briefId: string;
    actorId: string;
    siteUrl?: string | null;
  },
  deps: {
    storage?: AdStudioMediaStorage;
    capturer?: SitePageCapturer;
    renderScrollingVideo?: typeof renderScrollingPageVideo;
    runner?: FfmpegRunner;
    llm?: AdStudioLlm | null;
    now?: Date;
  } = {},
): Promise<AdStudioSiteScrollPageView[]> {
  await ensureOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const rawUrl = (ctx.siteUrl ?? brief.landing_page_url ?? '').trim();
  const startUrl = normalizeSitePageUrl(rawUrl);
  if (!startUrl) {
    throw new AdStudioSiteScrollError('invalid_url');
  }

  const addressGuard =
    adStudioRuntime().demoAddressCheck ??
    (async (target: string) => {
      await assertPublicHttpsUrl(target);
    });
  try {
    await addressGuard(startUrl);
  } catch {
    throw new AdStudioSiteScrollError('address_blocked');
  }

  const startSite = siteOf(startUrl);
  const allowedSites = new Set(startSite ? [startSite] : []);
  const cachedGuard = cachedAddressCheck(addressGuard);
  const allowRequest = async (req: { url: string; method: string; isNavigation: boolean }) =>
    (await decideDemoRequest(req, { loggedIn: true, sites: allowedSites }, cachedGuard)) === 'allow';

  const capturer = deps.capturer ?? adStudioRuntime().sitePageCapturer ?? createPlaywrightSitePageCapturer();
  const firstCaptureList = await capturer({
    urls: [startUrl],
    format: brief.video_format,
    discoverLinksOnFirst: true,
    allowRequest,
  });
  const firstCapture = firstCaptureList[0];
  if (!firstCapture || firstCapture.screenshot.byteLength === 0) {
    throw new AdStudioSiteScrollError('site_unreachable');
  }

  const ranked = rankCandidateSitePages({
    startUrl: firstCapture.url || startUrl,
    links: firstCapture.links,
    adName: brief.name,
    productDescription: brief.product_description,
    objective: brief.objective,
    maxPages: AD_STUDIO_SITE_SCROLL_MAX_PAGES,
  });

  const aiRefined = deps.llm
    ? await refineSelectedPagesWithLlm({
        candidates: ranked,
        discoveredLinks: firstCapture.links,
        brief,
        llm: deps.llm,
      })
    : null;

  const pickedPlan =
    aiRefined && aiRefined.length > 0
      ? aiRefined
      : ranked.map((entry) => ({
          url: entry.url,
          suggestedTitle: entry.suggestedTitle,
          kind: entry.kind,
          reason: entry.kind === 'home' ? 'Homepage overview' : 'Relevant page for this ad',
        }));

  const extraUrls = pickedPlan.map((entry) => entry.url).filter((url) => url !== firstCapture.url && url !== startUrl);
  const extraCaptures =
    extraUrls.length > 0
      ? await capturer({
          urls: extraUrls,
          format: brief.video_format,
          discoverLinksOnFirst: false,
          allowRequest,
        })
      : [];

  const captureByUrl = new Map<string, SitePageCaptureResult>([
    [startUrl, firstCapture],
    [firstCapture.url, firstCapture],
  ]);
  for (const item of extraCaptures) {
    if (item.screenshot.byteLength > 0) {
      captureByUrl.set(item.url, item);
    }
  }

  const storage = deps.storage ?? resolveAdStudioMediaStorage();
  const renderScroll = deps.renderScrollingVideo ?? adStudioRuntime().renderScrollingVideo ?? renderScrollingPageVideo;
  const runner = deps.runner ?? defaultFfmpegRunner();
  const resolution = normalizeVideoSettings(brief.video_settings).resolution;
  const now = deps.now ?? new Date();
  const capturedOn = now.toISOString();
  const workDir = await mkdtemp(path.join(tmpdir(), 'ad-studio-site-scan-'));

  const storedPages: AdStudioSiteScrollPage[] = [];
  const usedUrls = new Set<string>();
  try {
    const targets = [
      {
        url: firstCapture.url || startUrl,
        suggestedTitle: firstCapture.title || pickedPlan[0]?.suggestedTitle || formatHostAndPath(startUrl),
        kind: pickedPlan[0]?.kind ?? 'home',
        reason: pickedPlan[0]?.reason ?? 'Primary site page',
        capture: firstCapture,
      },
      ...pickedPlan
        .map((entry) => ({
          ...entry,
          capture: captureByUrl.get(entry.url),
        }))
        .filter((entry): entry is typeof entry & { capture: SitePageCaptureResult } => Boolean(entry.capture)),
    ];

    for (const target of targets) {
      if (storedPages.length >= AD_STUDIO_SITE_SCROLL_MAX_PAGES) break;
      if (usedUrls.has(target.url)) continue;
      usedUrls.add(target.url);

      const pageId = randomUUID();
      const title = (target.capture.title || target.suggestedTitle || formatHostAndPath(target.url)).slice(0, 100);
      const videoOut = path.join(workDir, `${pageId}.mp4`);
      try {
        await renderScroll({
          imageBytes: target.capture.screenshot,
          output: videoOut,
          format: brief.video_format,
          resolution,
          durationSeconds: AD_STUDIO_SITE_SCROLL_DEFAULT_SECONDS,
          runner,
        });
      } catch (error) {
        if (error instanceof FfmpegUnavailableError) throw new AdStudioSiteScrollError('ffmpeg_unavailable');
        if (error instanceof FfmpegFailedError) throw new AdStudioSiteScrollError('ffmpeg_failed');
        throw error;
      }

      const videoBytes = await readFile(videoOut);
      const screenshotPath = adStudioSitePageScreenshotObjectPath({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        briefId: ctx.briefId,
        pageId,
      });
      const videoPath = adStudioSitePageVideoObjectPath({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        briefId: ctx.briefId,
        pageId,
      });

      await storage.upload(screenshotPath, target.capture.screenshot, 'image/png');
      await storage.upload(videoPath, videoBytes, 'video/mp4');

      // Best-effort save into the project gallery so the screenshot can also be dropped into images or other scenes.
      await saveScreenshotToGalleryBestEffort({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        label: title,
        description: target.url,
        pngBytes: target.capture.screenshot,
        storage,
        now,
      });

      storedPages.push({
        id: pageId,
        url: target.url,
        title,
        kind: target.kind,
        relevanceReason: target.reason,
        screenshotGcsPath: screenshotPath,
        scrollVideoGcsPath: videoPath,
        durationSeconds: AD_STUDIO_SITE_SCROLL_DEFAULT_SECONDS,
        selected: storedPages.length < 2,
        capturedOn,
      });
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  await saveAdStudioBriefSitePages({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: ctx.briefId,
    sitePages: storedPages,
    landingPageUrl: startUrl,
    now,
  });

  return storedPages.map((page) => toAdStudioSiteScrollPageView(ctx.organizationId, ctx.projectId, ctx.briefId, page));
}

async function saveScreenshotToGalleryBestEffort(params: {
  organizationId: string;
  projectId: string;
  actorId: string;
  label: string;
  description: string;
  pngBytes: Buffer;
  storage: AdStudioMediaStorage;
  now: Date;
}): Promise<void> {
  try {
    const asset = await createAdStudioGalleryAsset({
      organizationId: params.organizationId,
      projectId: params.projectId,
      kind: 'image',
      source: 'walkthrough',
      label: params.label.slice(0, 80) || 'Website capture',
      description: params.description.slice(0, 300),
      gcsPath: 'pending',
      mimeType: 'image/png',
      byteSize: params.pngBytes.byteLength,
      actorId: params.actorId,
      now: params.now,
    });
    const objectPath = adStudioGalleryObjectPath({
      organizationId: params.organizationId,
      projectId: params.projectId,
      assetId: asset.id,
      mimeType: 'image/png',
    });
    await params.storage.upload(objectPath, params.pngBytes, 'image/png');
    asset.gcs_path = objectPath;
    await asset.save();
  } catch {
    // Full gallery quota or transient storage write must not block the scan itself.
  }
}

/** Saves which scanned site pages are automatically woven into the assembled ad video. */
export async function setBriefSitePageSelection(ctx: {
  organizationId: string;
  projectId: string;
  briefId: string;
  selectedPageIds: readonly string[];
  now?: Date;
}): Promise<AdStudioSiteScrollPageView[]> {
  await ensureOrm();
  const updated = await updateAdStudioBriefSitePageSelection(ctx);
  return (updated.site_pages ?? []).map((page) =>
    toAdStudioSiteScrollPageView(ctx.organizationId, ctx.projectId, ctx.briefId, page),
  );
}

/**
 * Turns a scanned website screenshot, gallery/uploaded image, or tall page screenshot into a smooth
 * scrolling video clip for a scene (`kind: 'upload'`, 0 AI video quota), mixing separate narration
 * when the scene calls for voice-over and a TTS client is available.
 */
export async function useScrollClipForScene(
  ctx: {
    organizationId: string;
    projectId: string;
    briefId: string;
    sceneId: string;
    actorId: string;
  },
  input: {
    sitePageId?: string;
    source?: AdStudioGallerySourceRef;
    bytes?: Buffer;
    fileName?: string | null;
    label?: string | null;
    alsoSaveToGallery?: boolean;
  },
  deps: {
    storage?: AdStudioMediaStorage;
    renderScrollingVideo?: typeof renderScrollingPageVideo;
    runner?: FfmpegRunner;
    tts?: AdStudioTts | null;
    now?: Date;
  } = {},
): Promise<{ clip: AdStudioClipView; clips: AdStudioClipView[]; videos: AdStudioVideoView[] }> {
  await ensureOrm();
  const storage = deps.storage ?? resolveAdStudioMediaStorage();
  const renderScroll = deps.renderScrollingVideo ?? adStudioRuntime().renderScrollingVideo ?? renderScrollingPageVideo;
  const runner = deps.runner ?? defaultFfmpegRunner();
  const now = deps.now ?? new Date();

  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  const scene = brief.scenes.find((candidate) => candidate.id === ctx.sceneId);
  if (!scene) {
    throw new AdStudioSiteScrollError('page_not_found');
  }
  const existingClips = await listAdStudioClips(ctx.organizationId, ctx.projectId, ctx.briefId);
  if (existingClips.some((clip) => clip.scene_id === ctx.sceneId && clip.status === 'generating')) {
    throw new AdStudioGalleryRequestError('invalid_input');
  }

  let imageBytes: Buffer;
  let label: string;
  if (input.sitePageId) {
    const page = (brief.site_pages ?? []).find((entry) => entry.id === input.sitePageId);
    if (!page) throw new AdStudioSiteScrollError('page_not_found');
    imageBytes = await readAdStudioObject(storage, page.screenshotGcsPath, AD_STUDIO_MAX_GALLERY_IMAGE_UPLOAD_BYTES);
    label = page.title || formatHostAndPath(page.url);
  } else if (input.source) {
    const resolved = await resolveGallerySource(
      { organizationId: ctx.organizationId, projectId: ctx.projectId },
      input.source,
      'image',
      { storage, runner },
    );
    imageBytes = resolved.bytes;
    label = resolved.label || 'Page scroll';
  } else if (input.bytes) {
    const clean = await prepareUploadedScrollImage(input.bytes);
    imageBytes = clean.bytes;
    label = (input.label ?? '').trim() || galleryLabelFromFileName(input.fileName ?? '') || 'Page scroll';
    if (input.alsoSaveToGallery) {
      await saveScreenshotToGalleryBestEffort({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        label,
        description: 'Page screenshot for scrolling clip',
        pngBytes: imageBytes,
        storage,
        now,
      });
    }
  } else {
    throw new AdStudioGalleryRequestError('invalid_input');
  }

  const workDir = await mkdtemp(path.join(tmpdir(), 'ad-studio-scene-scroll-'));
  let videoBytes: Buffer;
  try {
    const rawOut = path.join(workDir, 'scroll.mp4');
    const resolution = normalizeVideoSettings(brief.video_settings).resolution;
    try {
      await renderScroll({
        imageBytes,
        output: rawOut,
        format: brief.video_format,
        resolution,
        durationSeconds: scene.durationSeconds,
        runner,
      });
    } catch (error) {
      if (error instanceof FfmpegUnavailableError) throw new AdStudioSiteScrollError('ffmpeg_unavailable');
      if (error instanceof FfmpegFailedError) throw new AdStudioSiteScrollError('ffmpeg_failed');
      throw error;
    }
    videoBytes = await readFile(rawOut);

    if (narrationIsSeparate(scene) && deps.tts) {
      try {
        const wav = await deps.tts.synthesize({
          text: spokenNarration(scene),
          voice: ttsVoiceName(brief.narrator_voice),
          style: ttsNarrationStyle(brief.narrator_voice, languageName(brief.language)),
        });
        const wavFile = path.join(workDir, 'narration.wav');
        const narratedOut = path.join(workDir, 'narrated.mp4');
        await writeFile(wavFile, wav);
        await (adStudioRuntime().mixNarration ?? mixNarration)({
          video: rawOut,
          narration: wavFile,
          output: narratedOut,
          runner,
        });
        videoBytes = await readFile(narratedOut);
      } catch {
        // Keep the clean visual scrolling clip even if optional TTS mixing fails.
      }
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  const aspectRatio = AD_STUDIO_ASPECT_RATIO[brief.video_format];
  const rawResolution = normalizeVideoSettings(brief.video_settings).resolution;
  const resolution = rawResolution === '1080p' ? '1080p' : '720p';

  const clip = await createAdStudioClip({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: ctx.briefId,
    sceneId: scene.id,
    sceneFingerprint: sceneFingerprint(scene, briefVideoContext(brief)),
    kind: 'upload',
    parentClipId: null,
    prompt: label,
    model: 'site_scroll',
    aspectRatio,
    resolution,
    durationSeconds: scene.durationSeconds,
    requestedBy: ctx.actorId,
    narration: narrationIsSeparate(scene)
      ? {
          text: spokenNarration(scene),
          voice: ttsVoiceName(brief.narrator_voice),
          style: ttsNarrationStyle(brief.narrator_voice, languageName(brief.language)),
        }
      : null,
    now,
  });

  const objectPath = adStudioClipObjectPath({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: ctx.briefId,
    clipId: clip.id,
  });
  try {
    await storage.upload(objectPath, videoBytes, 'video/mp4');
  } catch (error) {
    await markAdStudioClipFailed(clip, 'storage_error', now);
    throw error;
  }
  await markAdStudioClipReady(clip, { gcsPath: objectPath, now });
  const chosenModel = await chooseAdStudioClip(ctx.organizationId, ctx.projectId, ctx.briefId, clip.id);
  const qaMarked = await recordAdStudioClipQa(
    chosenModel,
    { status: 'skipped', issues: [], transcript: null, model: null },
    now,
  ).catch(() => chosenModel);

  const [clipsAfter, videosAfter] = await Promise.all([
    listAdStudioClips(ctx.organizationId, ctx.projectId, ctx.briefId),
    listAdStudioVideos(ctx.organizationId, ctx.projectId, ctx.briefId),
  ]);

  return {
    clip: toAdStudioClipView(qaMarked),
    clips: clipsAfter.map(toAdStudioClipView),
    videos: videosAfter.map(toAdStudioVideoView),
  };
}
