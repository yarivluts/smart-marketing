import { describe, expect, it } from 'vitest';
import {
  AD_STUDIO_MAX_SCENE_REFERENCES,
  referencePromptLines,
  referencesShowText,
  sceneReferenceIssues,
  sniffReferenceMimeType,
  type AdStudioSceneReference,
} from './references';
import { fitAdStudioScenes, validateAdStudioScenes, type AdStudioScene } from './scenes';
import { buildScenePrompt, sceneFingerprint } from './video';

const CONTEXT = { format: 'horizontal' as const, language: 'en', productDescription: 'GrowthOS, growth analytics', voice: null };

function scene(references?: AdStudioSceneReference[]): AdStudioScene {
  return { id: 's1', durationSeconds: 5, visualPrompt: 'A marketer looks at a laptop', voiceover: '', onScreenText: '', ...(references ? { references } : {}) };
}

describe('scene reference images', () => {
  it('knows PNG and JPEG by their first bytes, whatever the upload claims', () => {
    expect(sniffReferenceMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffReferenceMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffReferenceMimeType(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(sniffReferenceMimeType(new Uint8Array([]))).toBeNull();
  });

  it('allows up to three distinct images per scene with one opening frame at most', () => {
    expect(sceneReferenceIssues(undefined)).toEqual([]);
    expect(sceneReferenceIssues([{ imageId: 'a', use: 'screen' }, { imageId: 'b', use: 'first_frame' }])).toEqual([]);
    const four = ['a', 'b', 'c', 'd'].map((imageId) => ({ imageId, use: 'subject' as const }));
    expect(sceneReferenceIssues(four)).toEqual(['too_many_references']);
    expect(four.length).toBeGreaterThan(AD_STUDIO_MAX_SCENE_REFERENCES);
    expect(sceneReferenceIssues([{ imageId: 'a', use: 'screen' }, { imageId: 'a', use: 'subject' }])).toEqual(['duplicate_reference']);
    expect(sceneReferenceIssues([{ imageId: 'a', use: 'poster' as never }])).toEqual(['invalid_reference_use']);
    expect(sceneReferenceIssues([{ imageId: 'a', use: 'first_frame' }, { imageId: 'b', use: 'first_frame' }])).toEqual(['two_first_frames']);
    expect(validateAdStudioScenes([scene([{ imageId: 'a', use: 'first_frame' }, { imageId: 'b', use: 'first_frame' }])])).toEqual([{ code: 'two_first_frames', scene: 1 }]);
  });

  it('keeps references when fitting a script and stores none when empty', () => {
    const [kept, none] = fitAdStudioScenes([scene([{ imageId: 'a', use: 'screen' }]), { ...scene([]), id: 's2' }], () => 'new');
    expect(kept.references).toEqual([{ imageId: 'a', use: 'screen' }]);
    expect('references' in none).toBe(false);
  });

  it('tells the video model how to use each image, in order, and lets a screen show its words', () => {
    const lines = referencePromptLines([
      { use: 'screen', description: ' The ad studio\n dashboard ' },
      { use: 'subject', description: '' },
      { use: 'first_frame', description: 'ignored' },
    ]);
    expect(lines[0]).toMatch(/^Attached image 1 is the real screen of the product \(The ad studio dashboard\)\./);
    expect(lines[0]).toContain('Keep the whole screen in view');
    expect(lines[1]).toBe('Attached image 2 shows a subject of this ad: whenever it appears, show it exactly as it looks in the image.');
    expect(lines[2]).toMatch(/^Attached image 3 is the opening frame/);
    // A screen makes the attached screens the only ones the shot may show.
    expect(lines[3]).toBe('Every screen in this shot shows only attached image 1. Where the description above mentions another app, chat, page or screen, show attached image 1 on the screen instead; never draw a different interface.');
    expect(referencePromptLines([{ use: 'subject', description: '' }])).toHaveLength(1);
    expect(referencePromptLines([{ use: 'screen', description: 'a' }, { use: 'screen', description: 'b' }])[2]).toContain('shows only attached images 1 and 2.');
    expect(referencesShowText([{ use: 'subject' }])).toBe(false);
    expect(referencesShowText([{ use: 'subject' }, { use: 'screen' }])).toBe(true);

    const plain = buildScenePrompt(scene(), CONTEXT);
    expect(plain).not.toContain('Attached image');
    expect(plain).toContain('Do not show any readable text');
    const withScreen = buildScenePrompt(scene(), CONTEXT, [{ use: 'screen', description: 'Dashboard' }]);
    expect(withScreen).toContain('Attached image 1 is the real screen of the product (Dashboard).');
    expect(withScreen).toContain('Apart from what the attached screen or opening frame shows, do not show any readable text');
  });

  it('changes the fingerprint when images are attached or their use changes, and only then', () => {
    const base = sceneFingerprint(scene(), CONTEXT);
    expect(sceneFingerprint(scene([]), CONTEXT)).toBe(base);
    const screen = sceneFingerprint(scene([{ imageId: 'a', use: 'screen' }]), CONTEXT);
    expect(screen).not.toBe(base);
    expect(sceneFingerprint(scene([{ imageId: 'a', use: 'subject' }]), CONTEXT)).not.toBe(screen);
    expect(sceneFingerprint(scene([{ imageId: 'b', use: 'screen' }]), CONTEXT)).not.toBe(screen);
  });
});
