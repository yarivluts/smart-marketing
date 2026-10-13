import type { AdStudioImageConcept, AdStudioImageFormat, AdStudioScene, AdStudioSearchAd } from '@growthos/shared';
import type { AdStudioClipView, AdStudioImageSlot } from './view';

/**
 * The Review step opens on a summary of the ad's creatives - each image idea, the video, the search
 * ad - as cards a person scans at a glance, then opens one to see and edit everything about it.
 * Pure: the page shapes the summaries, the overview component only draws them.
 */

/** Where a creative stands: ready to publish, needs the person's eye, still being made, or not started. */
export type CreativeState = 'ready' | 'attention' | 'working' | 'empty';

export interface ImageCreativeSummary {
  kind: 'image';
  conceptId: string;
  /** 1-based, as the person sees it ("Idea 2"). */
  index: number;
  headline: string;
  state: CreativeState;
  /** The chosen image of the first placement that has one, for the card's preview. */
  preview: { imageId: string; format: AdStudioImageFormat } | null;
  placements: { format: AdStudioImageFormat; state: CreativeState }[];
  hasCopy: boolean;
}

export interface VideoCreativeSummary {
  kind: 'video';
  state: CreativeState;
  scenes: number;
  rendered: number;
  /** The newest ready clip of the first scene that has one, for the card's preview. */
  previewClipId: string | null;
  assembled: boolean;
  assembledSeconds: number;
  hasCopy: boolean;
  /** A scene's newest clip is still rendering. */
  generating: boolean;
}

export interface SearchCreativeSummary {
  kind: 'search';
  state: CreativeState;
  headlines: number;
  descriptions: number;
  keywords: number;
  /** The first headline, for the card's preview. */
  sample: string | null;
  /** The second headline, which Google often shows after the first. */
  sampleSecond: string | null;
  /** The first description, for the card's preview. */
  sampleDescription: string | null;
}

function placementState(slot: AdStudioImageSlot): CreativeState {
  if (slot.generating) return 'working';
  if (slot.selected) {
    if (!slot.current || slot.selected.qa?.status === 'issues') return 'attention';
    return 'ready';
  }
  return slot.versions[0]?.status === 'failed' ? 'attention' : 'empty';
}

/** Several placements roll up into one state: anything needing a look wins, then work in progress. */
function rollUp(states: readonly CreativeState[]): CreativeState {
  if (states.length === 0) return 'empty';
  if (states.includes('attention')) return 'attention';
  if (states.includes('working')) return 'working';
  if (states.every((state) => state === 'ready')) return 'ready';
  return states.some((state) => state === 'ready') ? 'working' : 'empty';
}

export function summarizeImageCreatives(concepts: readonly AdStudioImageConcept[], slots: readonly AdStudioImageSlot[]): ImageCreativeSummary[] {
  return concepts.map((concept, at) => {
    const own = slots.filter((slot) => slot.conceptId === concept.id);
    const placements = own.map((slot) => ({ format: slot.format, state: placementState(slot) }));
    const shown = own.find((slot) => slot.selected?.status === 'ready');
    const copy = concept.copy;
    return {
      kind: 'image',
      conceptId: concept.id,
      index: at + 1,
      headline: concept.headline.trim(),
      state: rollUp(placements.map((placement) => placement.state)),
      preview: shown?.selected ? { imageId: shown.selected.id, format: shown.format } : null,
      placements,
      hasCopy: Boolean(copy && (copy.headline.trim() || copy.primaryText.trim())),
    };
  });
}

export function summarizeVideoCreative(params: {
  scenes: readonly Pick<AdStudioScene, 'id'>[];
  clips: readonly Pick<AdStudioClipView, 'id' | 'sceneId' | 'version' | 'status' | 'qa' | 'chosen'>[];
  assembled: boolean;
  assembledSeconds: number;
  hasCopy: boolean;
}): VideoCreativeSummary {
  const newest = params.scenes.map((scene) =>
    params.clips.filter((clip) => clip.sceneId === scene.id).sort((a, b) => b.version - a.version)[0] ?? null,
  );
  const rendered = newest.filter((clip) => clip?.status === 'ready').length;
  const generating = newest.some((clip) => clip?.status === 'generating');
  const flagged = newest.some((clip) => clip?.status === 'failed' || (clip?.status === 'ready' && clip.qa?.status === 'issues'));
  const previewClip = newest.find((clip) => clip?.status === 'ready') ?? null;
  let state: CreativeState;
  if (params.scenes.length === 0) state = 'empty';
  else if (flagged) state = 'attention';
  // Every scene rendered: ready once assembled into one video, otherwise still being put together.
  else if (rendered === params.scenes.length && !generating) state = params.assembled ? 'ready' : 'working';
  else state = rendered > 0 || generating ? 'working' : 'empty';
  return {
    kind: 'video',
    state,
    scenes: params.scenes.length,
    rendered,
    previewClipId: previewClip?.id ?? null,
    assembled: params.assembled,
    assembledSeconds: params.assembledSeconds,
    hasCopy: params.hasCopy,
    generating,
  };
}

/** Google needs at least 3 headlines and 2 descriptions for a responsive search ad. */
export function summarizeSearchCreative(ad: AdStudioSearchAd | null, keywords: number): SearchCreativeSummary {
  const headlines = ad?.headlines.filter((line) => line.trim()).length ?? 0;
  const descriptions = ad?.descriptions.filter((line) => line.trim()).length ?? 0;
  const state: CreativeState = !ad || (headlines === 0 && descriptions === 0) ? 'empty' : headlines >= 3 && descriptions >= 2 ? 'ready' : 'attention';
  const filled = (lines: readonly string[] | undefined) => (lines ?? []).map((line) => line.trim()).filter(Boolean);
  const [sample = null, sampleSecond = null] = filled(ad?.headlines);
  return { kind: 'search', state, headlines, descriptions, keywords, sample, sampleSecond, sampleDescription: filled(ad?.descriptions)[0] ?? null };
}

/**
 * The one thing to do next on the Review overview, from where the creatives stand: fix what needs a
 * look first, then assemble a video whose scenes are all rendered, then wait for work in progress,
 * then publish what is ready. With nothing made yet, start with the image ideas.
 */
export type ReviewNextStep =
  | { kind: 'attention'; count: number; item: ReviewItem }
  | { kind: 'assemble' }
  | { kind: 'working'; count: number }
  | { kind: 'publish'; ready: number }
  | { kind: 'start' };

export function reviewNextStep(images: readonly ImageCreativeSummary[], video: VideoCreativeSummary, search: SearchCreativeSummary): ReviewNextStep {
  const flagged: ReviewItem[] = [
    ...images.filter((image) => image.state === 'attention').map((image): ReviewItem => ({ kind: 'image', conceptId: image.conceptId })),
    ...(video.state === 'attention' ? [{ kind: 'video' } as const] : []),
    ...(search.state === 'attention' ? [{ kind: 'search' } as const] : []),
  ];
  if (flagged.length) return { kind: 'attention', count: flagged.length, item: flagged[0] };
  if (videoNeedsAssembly(video)) return { kind: 'assemble' };
  const states = [...images.map((image) => image.state), video.state, search.state];
  const working = states.filter((state) => state === 'working').length;
  if (working) return { kind: 'working', count: working };
  const ready = states.filter((state) => state === 'ready').length;
  return ready ? { kind: 'publish', ready } : { kind: 'start' };
}

/** Something is still being made, so the overview keeps itself current: an image or a clip rendering. */
export function reviewHasWorkInProgress(images: readonly ImageCreativeSummary[], video: VideoCreativeSummary): boolean {
  return video.generating || images.some((image) => image.placements.some((placement) => placement.state === 'working'));
}

/** Every scene rendered and nothing flagged, but not yet put together into one video. */
export function videoNeedsAssembly(video: VideoCreativeSummary): boolean {
  return video.state === 'working' && video.scenes > 0 && video.rendered === video.scenes && !video.assembled;
}

/** The review detail a URL asks for: one image idea, all of them, the video or the search ad; null for the overview. */
export type ReviewItem = { kind: 'image'; conceptId: string } | { kind: 'images' } | { kind: 'video' } | { kind: 'search' };

export function parseReviewItem(value: string | undefined): ReviewItem | null {
  if (!value) return null;
  if (value === 'images' || value === 'video' || value === 'search') return { kind: value };
  if (value.startsWith('image:') && value.length > 'image:'.length) return { kind: 'image', conceptId: value.slice('image:'.length) };
  return null;
}

export function reviewItemParam(item: ReviewItem): string {
  return item.kind === 'image' ? `image:${item.conceptId}` : item.kind;
}

/** A landing page's host the way a search result shows it ("example.com"); null when there is none. */
export function displayHost(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** The writing direction of the ad's language, for previews of its text. */
export function adTextDirection(language: string): 'rtl' | 'ltr' {
  return ['he', 'ar', 'fa', 'ur'].includes(language.toLowerCase()) ? 'rtl' : 'ltr';
}
