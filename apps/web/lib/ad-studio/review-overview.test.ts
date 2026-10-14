import { describe, expect, it } from 'vitest';
import type { AdStudioImageConcept } from '@growthos/shared';
import type { AdStudioClipView, AdStudioImageSlot, AdStudioImageView } from './view';
import {
  displayHost,
  parseReviewItem,
  reviewItemParam,
  reviewHasWorkInProgress,
  reviewNextStep,
  summarizeImageCreatives,
  summarizeSearchCreative,
  summarizeVideoCreative,
  videoNeedsAssembly,
  type CreativeState,
  type ImageCreativeSummary,
  type SearchCreativeSummary,
  type VideoCreativeSummary,
} from './review-overview';

const concept = (id: string, extra: Partial<AdStudioImageConcept> = {}): AdStudioImageConcept => ({ id, visualPrompt: 'A lawyer', headline: ' Sign fast ', formats: ['square', 'story'], ...extra });

const image = (extra: Partial<AdStudioImageView> = {}): AdStudioImageView =>
  ({ id: 'i1', conceptId: 'c1', format: 'square', kind: 'render', version: 1, status: 'ready', selected: true, parentImageId: null, instruction: null, conceptFingerprint: 'f', failureCode: null, mimeType: 'image/jpeg', requestedOn: '', completedOn: '', qa: null, imageSize: '2K', ...extra }) as AdStudioImageView;

const slot = (extra: Partial<AdStudioImageSlot>): AdStudioImageSlot => ({ conceptId: 'c1', format: 'square', versions: [], selected: null, current: false, generating: false, ...extra });

describe('summarizeImageCreatives', () => {
  it('is ready when every placement has a current, checked image, with a preview and the copy noted', () => {
    const ready = image();
    const [summary] = summarizeImageCreatives(
      [concept('c1', { copy: { headline: 'Sign', primaryText: '', description: '' } })],
      [slot({ versions: [ready], selected: ready, current: true }), slot({ format: 'story', versions: [image({ id: 'i2', format: 'story' })], selected: image({ id: 'i2', format: 'story' }), current: true })],
    );
    expect(summary).toMatchObject({ kind: 'image', index: 1, headline: 'Sign fast', state: 'ready', preview: { imageId: 'i1', format: 'square' }, hasCopy: true });
    expect(summary.placements).toEqual([
      { format: 'square', state: 'ready' },
      { format: 'story', state: 'ready' },
    ]);
  });

  it('needs a look when a placement failed its check, failed to render or is out of date; working while one renders', () => {
    const flagged = image({ qa: { status: 'issues', issues: [], renders: 3 } });
    expect(summarizeImageCreatives([concept('c1')], [slot({ versions: [flagged], selected: flagged, current: true })])[0].state).toBe('attention');
    expect(summarizeImageCreatives([concept('c1')], [slot({ versions: [image({ status: 'failed', selected: false })] })])[0].state).toBe('attention');
    expect(summarizeImageCreatives([concept('c1')], [slot({ versions: [image()], selected: image(), current: false })])[0].state).toBe('attention');
    const ready = image();
    expect(summarizeImageCreatives([concept('c1')], [slot({ versions: [ready], selected: ready, current: true }), slot({ format: 'story', generating: true })])[0].state).toBe('working');
    expect(summarizeImageCreatives([concept('c1')], [slot({}), slot({ format: 'story' })])[0]).toMatchObject({ state: 'empty', preview: null, hasCopy: false });
  });
});

describe('summarizeVideoCreative', () => {
  const clip = (extra: Partial<AdStudioClipView>) => ({ id: 'k1', sceneId: 's1', version: 1, status: 'ready', qa: null, chosen: false, ...extra }) as AdStudioClipView;

  it('is ready only once every scene is rendered and the video assembled', () => {
    const scenes = [{ id: 's1' }, { id: 's2' }];
    const clips = [clip({}), clip({ id: 'k2', sceneId: 's2' })];
    expect(summarizeVideoCreative({ scenes, clips, assembled: true, assembledSeconds: 15, hasCopy: true })).toMatchObject({ state: 'ready', rendered: 2, previewClipId: 'k1', assembledSeconds: 15 });
    expect(summarizeVideoCreative({ scenes, clips, assembled: false, assembledSeconds: 0, hasCopy: true }).state).toBe('working');
  });

  it('judges each scene by its newest clip: a flagged or failed one needs a look', () => {
    const scenes = [{ id: 's1' }];
    expect(summarizeVideoCreative({ scenes, clips: [clip({}), clip({ id: 'k9', version: 2, status: 'failed' })], assembled: false, assembledSeconds: 0, hasCopy: false }).state).toBe('attention');
    expect(summarizeVideoCreative({ scenes, clips: [clip({ qa: { status: 'issues' } as AdStudioClipView['qa'] })], assembled: false, assembledSeconds: 0, hasCopy: false }).state).toBe('attention');
    expect(summarizeVideoCreative({ scenes, clips: [], assembled: false, assembledSeconds: 0, hasCopy: false })).toMatchObject({ state: 'empty', previewClipId: null });
    expect(summarizeVideoCreative({ scenes: [], clips: [], assembled: false, assembledSeconds: 0, hasCopy: false }).state).toBe('empty');
    expect(summarizeVideoCreative({ scenes, clips: [clip({}), clip({ id: 'k9', version: 2, status: 'generating' })], assembled: false, assembledSeconds: 0, hasCopy: false })).toMatchObject({ state: 'working', generating: true });
    expect(summarizeVideoCreative({ scenes, clips: [clip({})], assembled: false, assembledSeconds: 0, hasCopy: false }).generating).toBe(false);
  });
});

describe('summarizeSearchCreative', () => {
  it('is ready at 3 headlines and 2 descriptions, needs a look below, empty without an ad', () => {
    expect(summarizeSearchCreative({ headlines: [' ', 'A', 'B', 'C'], descriptions: ['D ', 'E'], path1: '', path2: '' }, 12)).toEqual({ kind: 'search', state: 'ready', headlines: 3, descriptions: 2, keywords: 12, sample: 'A', sampleSecond: 'B', sampleDescription: 'D' });
    expect(summarizeSearchCreative({ headlines: ['A'], descriptions: [], path1: '', path2: '' }, 0)).toMatchObject({ state: 'attention', sample: 'A', sampleSecond: null, sampleDescription: null });
    expect(summarizeSearchCreative(null, 4)).toMatchObject({ state: 'empty', sample: null, sampleSecond: null, sampleDescription: null });
  });

  it('needs a look when the ad is written but no keyword is chosen, since publishing refuses it', () => {
    expect(summarizeSearchCreative({ headlines: ['A', 'B', 'C'], descriptions: ['D', 'E'], path1: '', path2: '' }, 0)).toMatchObject({ state: 'attention', keywords: 0 });
  });
});

describe('reviewNextStep', () => {
  const img = (conceptId: string, state: CreativeState): ImageCreativeSummary => ({ kind: 'image', conceptId, index: 1, headline: '', state, preview: null, placements: [], hasCopy: true });
  const video = (extra: Partial<VideoCreativeSummary> = {}): VideoCreativeSummary => ({ kind: 'video', state: 'ready', scenes: 3, rendered: 3, previewClipId: null, assembled: true, assembledSeconds: 15, hasCopy: true, generating: false, ...extra });
  const search = (state: CreativeState): SearchCreativeSummary => ({ kind: 'search', state, headlines: 0, descriptions: 0, keywords: 0, sample: null, sampleSecond: null, sampleDescription: null });
  const unassembled = video({ state: 'working', assembled: false, assembledSeconds: 0 });

  it('sends the person to the first creative that needs a look before anything else', () => {
    expect(reviewNextStep([img('c1', 'ready'), img('c2', 'attention')], unassembled, search('attention'))).toEqual({ kind: 'attention', count: 2, item: { kind: 'image', conceptId: 'c2' } });
    expect(reviewNextStep([img('c1', 'ready')], video({ state: 'attention' }), search('ready'))).toEqual({ kind: 'attention', count: 1, item: { kind: 'video' } });
  });

  it('asks to assemble a video whose scenes are all rendered, then waits on work in progress', () => {
    expect(reviewNextStep([img('c1', 'working')], unassembled, search('ready'))).toEqual({ kind: 'assemble' });
    expect(videoNeedsAssembly(unassembled)).toBe(true);
    expect(videoNeedsAssembly(video({ state: 'working', rendered: 2, assembled: false }))).toBe(false);
    expect(reviewNextStep([img('c1', 'working')], video({ state: 'working', rendered: 2, assembled: false }), search('ready'))).toEqual({ kind: 'working', count: 2 });
  });

  it('counts a rendering clip or image as work in progress', () => {
    expect(reviewHasWorkInProgress([img('c1', 'ready')], video())).toBe(false);
    expect(reviewHasWorkInProgress([img('c1', 'ready')], video({ generating: true }))).toBe(true);
    expect(reviewHasWorkInProgress([{ ...img('c1', 'working'), placements: [{ format: 'square', state: 'working' }] }], video())).toBe(true);
  });

  it('moves on to publishing once nothing is pending, and starts from the ideas when nothing is made', () => {
    expect(reviewNextStep([img('c1', 'ready'), img('c2', 'empty')], video(), search('empty'))).toEqual({ kind: 'publish', ready: 2 });
    expect(reviewNextStep([], video({ state: 'empty', scenes: 0, rendered: 0, assembled: false }), search('empty'))).toEqual({ kind: 'start' });
  });
});

describe('review items in the URL', () => {
  it('round-trips each detail and ignores anything else', () => {
    for (const item of [{ kind: 'image', conceptId: 'c-1' }, { kind: 'images' }, { kind: 'video' }, { kind: 'search' }] as const) {
      expect(parseReviewItem(reviewItemParam(item))).toEqual(item);
    }
    expect(parseReviewItem(undefined)).toBeNull();
    expect(parseReviewItem('image:')).toBeNull();
    expect(parseReviewItem('other')).toBeNull();
  });
});

describe('displayHost', () => {
  it('shows the landing page host without the scheme or www, and nothing for a missing or broken URL', () => {
    expect(displayHost('https://www.easysign.co.il/legal?utm=1')).toBe('easysign.co.il');
    expect(displayHost('easysign.co.il/legal')).toBe('easysign.co.il');
    expect(displayHost(null)).toBeNull();
    expect(displayHost('  ')).toBeNull();
    expect(displayHost('http://')).toBeNull();
  });
});
