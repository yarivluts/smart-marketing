import {
  assemblyPlan,
  searchAdDisplayUrl,
  voiceDescription,
  type AdShareFeedbackItem,
  type AdStudioAdCopy,
  type AdStudioImageFormat,
  type AdStudioSearchAd,
} from '@growthos/shared';
import { adStudioImageSlots, currentAssembledVideo, type AdStudioClipView, type AdStudioImageView, type AdStudioVideoView } from './view';
import type { AdStudioBriefView } from './store';

/**
 * What a client sees through a share link (pure; no server imports): per ad, the finished image
 * ideas (the chosen, up-to-date image of each placement) and the current assembled video. Drafts,
 * alternatives and out-of-date renders are never part of it.
 */

export interface SharedImageAd {
  conceptId: string;
  /** 1-based position among the ad's ideas, for the "Idea 2" label. */
  index: number;
  copy: AdStudioAdCopy | null;
  byFormat: Partial<Record<AdStudioImageFormat, string>>;
  /** Present only when pre-publication drafts are included. */
  isDraft?: boolean;
  headline?: string;
  visualPrompt?: string;
  plannedFormats?: AdStudioImageFormat[];
}

export interface SharedScenePreview {
  id: string;
  index: number;
  durationSeconds: number;
  narration: string;
  onScreenText: string;
  visualPrompt: string;
  clipSrc: string | null;
}

export interface SharedBriefDraftMeta {
  objective: string;
  productDescription: string;
  format: 'vertical' | 'horizontal';
  targetSeconds: number;
  keywords: string[];
  audienceSummary: string | null;
}

export interface SharedCampaignDraftAdItem {
  groupName: string;
  headline: string;
  headlines?: string[];
  primaryText: string;
  descriptions?: string[];
  description?: string;
  linkUrl: string;
  keywords?: string[];
  audience?: string;
}

export interface SharedCampaignDraftItem {
  targetId: string;
  campaignName: string;
  platform: 'meta' | 'google_ads';
  dailyBudgetUsd: number;
  ads: SharedCampaignDraftAdItem[];
}

export interface SharedVideoAd {
  src: string;
  vertical: boolean;
  copy: AdStudioAdCopy | null;
  durationSeconds: number;
}

export interface SharedSearchAd {
  headlines: string[];
  descriptions: string[];
  path1: string;
  path2: string;
  displayUrl: string;
}

export interface SharedBriefAds {
  id: string;
  name: string;
  language: string;
  landingPageUrl: string | null;
  images: SharedImageAd[];
  video: SharedVideoAd | null;
  searchAd?: SharedSearchAd | null;
  isPrePublishDraft?: boolean;
  scenes?: SharedScenePreview[];
  videoCopyDraft?: AdStudioAdCopy | null;
  draftMeta?: SharedBriefDraftMeta | null;
}

export interface SharedCampaignResultItem {
  id: string;
  label: string;
  platform: 'meta_ads' | 'google_ads' | 'simulated';
  status: 'enabled' | 'paused' | 'removed' | 'none';
  dailyBudgetUsd: number;
  totalSpendUsd: number | null;
  roas: number | null;
  ctrPct: number | null;
  conversions: number | null;
}

export interface SharedCampaignResultsSummary {
  totalSpendUsd: number | null;
  metaSpendUsd: number | null;
  googleSpendUsd: number | null;
  activeCampaignsCount: number;
  totalCampaignsCount: number;
  campaignsWithSpendCount: number;
  items: SharedCampaignResultItem[];
}

export interface SharedAdsPage {
  brandName: string;
  logoSrc: string | null;
  expiresOn: string;
  briefs: SharedBriefAds[];
  token?: string;
  label?: string;
  includeResults?: boolean;
  allowFeedback?: boolean;
  includeDrafts?: boolean;
  revisionNumber?: number;
  revisionNote?: string | null;
  results?: SharedCampaignResultsSummary | null;
  feedback?: AdShareFeedbackItem[];
  campaignDrafts?: SharedCampaignDraftItem[];
}

/**
 * A link's dates, by day. Fixed to UTC so the server render and the browser print the same text
 * (a local-time date would differ between them and break hydration); a day is precise enough here.
 */
export function formatShareDate(locale: string, iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

/** Where a shared link's media is served from; every URL carries the token, never an org or project id. */
export function sharedMediaBase(token: string): string {
  return `/api/share/ads/${encodeURIComponent(token)}`;
}

export function sharedImageSrc(token: string, briefId: string, imageId: string): string {
  return `${sharedMediaBase(token)}/briefs/${encodeURIComponent(briefId)}/images/${encodeURIComponent(imageId)}`;
}

export function sharedVideoSrc(token: string, briefId: string, videoId: string): string {
  return `${sharedMediaBase(token)}/briefs/${encodeURIComponent(briefId)}/videos/${encodeURIComponent(videoId)}`;
}

export function sharedClipSrc(token: string, briefId: string, clipId: string): string {
  return `${sharedMediaBase(token)}/briefs/${encodeURIComponent(briefId)}/clips/${encodeURIComponent(clipId)}`;
}

/** Picks the best ready clip for a pre-publication scene preview (chosen first, else newest ready version). */
function pickReadySceneClip(clips: readonly AdStudioClipView[], sceneId: string): AdStudioClipView | null {
  const ready = clips.filter((clip) => clip.sceneId === sceneId && clip.status === 'ready');
  if (!ready.length) return null;
  return ready.find((clip) => clip.chosen) ?? [...ready].sort((a, b) => b.version - a.version)[0];
}

/**
 * One ad's creatives for external review.
 * - Standard links (`includeDrafts` false/omitted): only chosen, up-to-date creatives and current
 *   assembled videos, returning null when nothing is finished yet.
 * - Pre-publication links (`includeDrafts` true): also exposes brief goals/keywords/targeting,
 *   draft image concepts (even before renders exist or after copy edits), storyboard scenes with
 *   playable scene clips, and proposed Search ads before campaign launch.
 */
export function sharedBriefAds(params: {
  token: string;
  includeDrafts?: boolean;
  brief: Pick<
    AdStudioBriefView,
    'id' | 'name' | 'language' | 'landingPageUrl' | 'imageConcepts' | 'scenes' | 'format' | 'voice' | 'videoSettings' | 'videoCopy'
  > & {
    searchAd?: AdStudioSearchAd | null;
    objective?: string;
    productDescription?: string;
    targetSeconds?: number;
    searchKeywords?: { keywords: readonly (string | { text: string })[] } | null;
    metaTargeting?: { countries: readonly string[]; ageMin: number; ageMax: number } | null;
  };
  images: readonly AdStudioImageView[];
  clips: readonly AdStudioClipView[];
  videos: readonly AdStudioVideoView[];
}): SharedBriefAds | null {
  const { token, brief, includeDrafts = false } = params;
  const slots = adStudioImageSlots(brief.imageConcepts, params.images, brief.language);
  const images: SharedImageAd[] = [];
  brief.imageConcepts.forEach((concept, position) => {
    const byFormat: Partial<Record<AdStudioImageFormat, string>> = {};
    let hasStaleSelected = false;
    for (const slot of slots) {
      if (slot.conceptId !== concept.id) continue;
      if (includeDrafts) {
        if (slot.selected && slot.selected.status === 'ready') {
          byFormat[slot.format] = sharedImageSrc(token, brief.id, slot.selected.id);
          if (!slot.current) hasStaleSelected = true;
        }
      } else if (slot.current && slot.selected) {
        byFormat[slot.format] = sharedImageSrc(token, brief.id, slot.selected.id);
      }
    }
    if (Object.keys(byFormat).length) {
      images.push({
        conceptId: concept.id,
        index: position + 1,
        copy: concept.copy ?? null,
        byFormat,
        ...(includeDrafts && hasStaleSelected ? { isDraft: true } : {}),
      });
    } else if (includeDrafts) {
      images.push({
        conceptId: concept.id,
        index: position + 1,
        copy: concept.copy ?? (concept.headline ? { headline: concept.headline, primaryText: '', description: '' } : null),
        byFormat: {},
        isDraft: true,
        headline: concept.headline,
        visualPrompt: concept.visualPrompt,
        plannedFormats: [...concept.formats],
      });
    }
  });

  let video: SharedVideoAd | null = null;
  const context = { format: brief.format, language: brief.language, voice: voiceDescription(brief.voice), settings: brief.videoSettings };
  const plan = assemblyPlan(brief.scenes, params.clips, context);
  const assembled = currentAssembledVideo(params.videos, plan?.map((entry) => entry.clip.id) ?? null);
  if ((assembled.current || includeDrafts) && assembled.latest && assembled.latest.status === 'ready') {
    video = {
      src: sharedVideoSrc(token, brief.id, assembled.latest.id),
      vertical: brief.format === 'vertical',
      copy: brief.videoCopy ?? null,
      durationSeconds: assembled.latest.durationSeconds,
    };
  }

  const searchAd: SharedSearchAd | null =
    brief.searchAd && (brief.searchAd.headlines.length > 0 || brief.searchAd.descriptions.length > 0)
      ? {
          headlines: [...brief.searchAd.headlines],
          descriptions: [...brief.searchAd.descriptions],
          path1: brief.searchAd.path1,
          path2: brief.searchAd.path2,
          displayUrl: searchAdDisplayUrl(brief.landingPageUrl, brief.searchAd),
        }
      : null;

  if (!includeDrafts) {
    if (!images.length && !video && !searchAd) return null;
    return {
      id: brief.id,
      name: brief.name,
      language: brief.language,
      landingPageUrl: brief.landingPageUrl,
      images,
      video,
      ...(searchAd ? { searchAd } : {}),
    };
  }

  const scenes: SharedScenePreview[] =
    brief.scenes.length > 0 && !assembled.current
      ? brief.scenes.map((scene, index) => {
          const clip = pickReadySceneClip(params.clips, scene.id);
          return {
            id: scene.id,
            index: index + 1,
            durationSeconds: clip?.durationSeconds ?? scene.durationSeconds,
            narration: scene.voiceover,
            onScreenText: scene.onScreenText,
            visualPrompt: scene.visualPrompt,
            clipSrc: clip ? sharedClipSrc(token, brief.id, clip.id) : null,
          };
        })
      : [];

  const targetingCountries = brief.metaTargeting?.countries ?? [];
  const audienceSummary = brief.metaTargeting
    ? [targetingCountries.join(', '), `${brief.metaTargeting.ageMin}-${brief.metaTargeting.ageMax}`].filter(Boolean).join(' · ')
    : null;
  const keywords = brief.searchKeywords?.keywords
    ? brief.searchKeywords.keywords
        .map((entry) => (typeof entry === 'string' ? entry : entry.text))
        .filter((text) => Boolean(text && text.trim()))
    : [];
  const objective = brief.objective ?? '';
  const productDescription = brief.productDescription ?? '';
  const draftMeta: SharedBriefDraftMeta | null =
    objective || productDescription || keywords.length > 0 || audienceSummary
      ? {
          objective,
          productDescription,
          format: brief.format,
          targetSeconds: brief.targetSeconds ?? 15,
          keywords,
          audienceSummary,
        }
      : null;

  return {
    id: brief.id,
    name: brief.name,
    language: brief.language,
    landingPageUrl: brief.landingPageUrl,
    images,
    video,
    ...(searchAd ? { searchAd } : {}),
    isPrePublishDraft: true,
    ...(scenes.length ? { scenes } : {}),
    ...(scenes.length && brief.videoCopy ? { videoCopyDraft: brief.videoCopy } : {}),
    ...(draftMeta ? { draftMeta } : {}),
  };
}
