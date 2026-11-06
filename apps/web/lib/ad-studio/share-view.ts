import { assemblyPlan, voiceDescription, type AdStudioAdCopy, type AdStudioImageFormat } from '@growthos/shared';
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
}

export interface SharedVideoAd {
  src: string;
  vertical: boolean;
  copy: AdStudioAdCopy | null;
  durationSeconds: number;
}

export interface SharedBriefAds {
  id: string;
  name: string;
  language: string;
  landingPageUrl: string | null;
  images: SharedImageAd[];
  video: SharedVideoAd | null;
}

export interface SharedAdsPage {
  brandName: string;
  logoSrc: string | null;
  expiresOn: string;
  briefs: SharedBriefAds[];
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

/** One ad's finished creatives, or null when it has none yet (nothing to show the client). */
export function sharedBriefAds(params: {
  token: string;
  brief: Pick<AdStudioBriefView, 'id' | 'name' | 'language' | 'landingPageUrl' | 'imageConcepts' | 'scenes' | 'format' | 'voice' | 'videoSettings' | 'videoCopy'>;
  images: readonly AdStudioImageView[];
  clips: readonly AdStudioClipView[];
  videos: readonly AdStudioVideoView[];
}): SharedBriefAds | null {
  const { token, brief } = params;
  const slots = adStudioImageSlots(brief.imageConcepts, params.images, brief.language);
  const images: SharedImageAd[] = [];
  brief.imageConcepts.forEach((concept, position) => {
    const byFormat: Partial<Record<AdStudioImageFormat, string>> = {};
    for (const slot of slots) {
      if (slot.conceptId === concept.id && slot.current && slot.selected) byFormat[slot.format] = sharedImageSrc(token, brief.id, slot.selected.id);
    }
    if (Object.keys(byFormat).length) images.push({ conceptId: concept.id, index: position + 1, copy: concept.copy ?? null, byFormat });
  });

  let video: SharedVideoAd | null = null;
  const context = { format: brief.format, language: brief.language, voice: voiceDescription(brief.voice), settings: brief.videoSettings };
  const plan = assemblyPlan(brief.scenes, params.clips, context);
  const assembled = currentAssembledVideo(params.videos, plan?.map((entry) => entry.clip.id) ?? null);
  if (assembled.current && assembled.latest) {
    video = {
      src: sharedVideoSrc(token, brief.id, assembled.latest.id),
      vertical: brief.format === 'vertical',
      copy: brief.videoCopy ?? null,
      durationSeconds: assembled.latest.durationSeconds,
    };
  }

  if (!images.length && !video) return null;
  return { id: brief.id, name: brief.name, language: brief.language, landingPageUrl: brief.landingPageUrl, images, video };
}
