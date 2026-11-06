import { describe, expect, it } from 'vitest';
import { imageConceptFingerprint, sceneFingerprint, type AdStudioImageConcept, type AdStudioScene } from '@growthos/shared';
import type { AdStudioClipView, AdStudioImageView, AdStudioVideoView } from './view';
import { sharedBriefAds, sharedImageSrc, sharedVideoSrc } from './share-view';

const TOKEN = 'T'.repeat(43);
const concept = (id: string, extra: Partial<AdStudioImageConcept> = {}): AdStudioImageConcept => ({ id, visualPrompt: `Picture ${id}`, headline: 'Sign fast', formats: ['square', 'story'], ...extra });

const image = (extra: Partial<AdStudioImageView> & Pick<AdStudioImageView, 'id' | 'conceptId' | 'format'>): AdStudioImageView =>
  ({ kind: 'render', version: 1, status: 'ready', selected: true, parentImageId: null, instruction: null, conceptFingerprint: '', failureCode: null, mimeType: 'image/png', requestedOn: '', completedOn: '', qa: null, imageSize: '2K', ...extra }) as AdStudioImageView;

const SCENES: AdStudioScene[] = [{ id: 's1', durationSeconds: 5, visualPrompt: 'A desk', voiceover: '', onScreenText: '' }];

const brief = (extra: Partial<Parameters<typeof sharedBriefAds>[0]['brief']> = {}): Parameters<typeof sharedBriefAds>[0]['brief'] => ({
  id: 'b1',
  name: 'Sign in 30 seconds',
  language: 'en',
  landingPageUrl: 'https://example.com',
  imageConcepts: [],
  scenes: [],
  format: 'vertical',
  voice: null,
  videoSettings: null,
  videoCopy: null,
  ...extra,
});

const current = (c: AdStudioImageConcept, format: AdStudioImageView['format']) => imageConceptFingerprint(c, format, 'en');

describe('sharedBriefAds', () => {
  it('shows each idea with the chosen, up-to-date image of each placement, and its copy', () => {
    const c1 = concept('c1', { copy: { headline: 'Sign', primaryText: 'Fast', description: '' } });
    const c2 = concept('c2', { formats: ['square'] });
    const images = [
      image({ id: 'i1', conceptId: 'c1', format: 'square', conceptFingerprint: current(c1, 'square') }),
      // An older version that is not the chosen one.
      image({ id: 'i0', conceptId: 'c1', format: 'square', selected: false, conceptFingerprint: current(c1, 'square') }),
      image({ id: 'i2', conceptId: 'c1', format: 'story', conceptFingerprint: current(c1, 'story') }),
      // Out of date: the idea changed after it was rendered.
      image({ id: 'i3', conceptId: 'c2', format: 'square', conceptFingerprint: 'stale' }),
    ];
    const shared = sharedBriefAds({ token: TOKEN, brief: brief({ imageConcepts: [c1, c2] }), images, clips: [], videos: [] });
    expect(shared).toEqual({
      id: 'b1',
      name: 'Sign in 30 seconds',
      language: 'en',
      landingPageUrl: 'https://example.com',
      images: [{ conceptId: 'c1', index: 1, copy: { headline: 'Sign', primaryText: 'Fast', description: '' }, byFormat: { square: sharedImageSrc(TOKEN, 'b1', 'i1'), story: sharedImageSrc(TOKEN, 'b1', 'i2') } }],
      video: null,
    });
  });

  it('is null for an ad with nothing finished, and never shows an unfinished image', () => {
    const c1 = concept('c1');
    expect(sharedBriefAds({ token: TOKEN, brief: brief({ imageConcepts: [c1] }), images: [image({ id: 'i1', conceptId: 'c1', format: 'square', status: 'generating', conceptFingerprint: current(c1, 'square') })], clips: [], videos: [] })).toBeNull();
    expect(sharedBriefAds({ token: TOKEN, brief: brief(), images: [], clips: [], videos: [] })).toBeNull();
  });

  it('shows the assembled video only while it is made of the current clips', () => {
    const fingerprint = sceneFingerprint(SCENES[0], { format: 'vertical', language: 'en', voice: null, settings: null });
    const clip = { id: 'k1', sceneId: 's1', version: 1, status: 'ready', sceneFingerprint: fingerprint, durationSeconds: 5, chosen: false } as AdStudioClipView;
    const video = { id: 'v1', status: 'ready', failureReason: null, clipIds: ['k1'], durationSeconds: 5.2, requestedOn: '', assembledOn: '' } as AdStudioVideoView;
    const copy = { headline: 'Watch', primaryText: '', description: '' };
    const shared = sharedBriefAds({ token: TOKEN, brief: brief({ scenes: SCENES, videoCopy: copy }), images: [], clips: [clip], videos: [video] });
    expect(shared?.video).toEqual({ src: sharedVideoSrc(TOKEN, 'b1', 'v1'), vertical: true, copy, durationSeconds: 5.2 });

    const stale = { ...clip, sceneFingerprint: 'old' };
    expect(sharedBriefAds({ token: TOKEN, brief: brief({ scenes: SCENES }), images: [], clips: [stale], videos: [video] })).toBeNull();
    expect(sharedBriefAds({ token: TOKEN, brief: brief({ scenes: SCENES }), images: [], clips: [clip], videos: [{ ...video, clipIds: ['other'] }] })).toBeNull();
  });

  it('puts only the token in media addresses', () => {
    expect(sharedImageSrc(TOKEN, 'b1', 'i1')).toBe(`/api/share/ads/${TOKEN}/briefs/b1/images/i1`);
    expect(sharedVideoSrc(TOKEN, 'b1', 'v1')).toBe(`/api/share/ads/${TOKEN}/briefs/b1/videos/v1`);
  });
});
