import { describe, expect, it } from 'vitest';
import { fitAdStudioScenes, speakerFields, validateAdStudioScenes, type AdStudioScene } from './scenes';
import { buildScenePrompt, sceneFingerprint } from './video';

const CONTEXT = { format: 'vertical' as const, language: 'en', productDescription: 'E-signatures for lawyers', voice: null };

function scene(overrides: Partial<AdStudioScene> = {}): AdStudioScene {
  return { id: 's1', durationSeconds: 5, visualPrompt: 'Two lawyers at a desk', voiceover: 'Sign in seconds.', onScreenText: '', ...overrides };
}

describe('who speaks a scene', () => {
  it('reads the narration as an off-screen voice-over by default, with no one on screen speaking', () => {
    const prompt = buildScenePrompt(scene(), CONTEXT);
    expect(prompt).toContain('voice-over narrator says, in English: "Sign in seconds."');
    expect(prompt).toContain('the narrator is never seen, and no one in the shot speaks');
  });

  it('has a person in the shot say the line, lip-synced, and only the named one when there are several', () => {
    const anyone = buildScenePrompt(scene({ delivery: 'on_screen' }), CONTEXT);
    expect(anyone).toContain('Audio: the person in the shot looks at the camera and says, in English: "Sign in seconds."');
    expect(anyone).toContain('Their lips move in sync with every word. Only this one person speaks. There is no off-screen narrator.');
    expect(anyone).not.toContain('narrator is never seen');
    const named = buildScenePrompt(scene({ delivery: 'on_screen', speaker: '  the lawyer in the  blue suit ' }), CONTEXT);
    expect(named).toContain('Audio: the lawyer in the blue suit in the shot looks at the camera');
    expect(named).toContain('No one else in the shot speaks.');
    // With nikud, the on-screen speaker reads the vocalized words exactly.
    expect(buildScenePrompt(scene({ delivery: 'on_screen', pronunciation: 'Sign in seconds!' }), { ...CONTEXT, language: 'he' })).toContain('full nikud vowel marks');
  });

  it('keeps every earlier fingerprint for the voice-over default, and changes it with an on-screen speaker', () => {
    const base = sceneFingerprint(scene(), CONTEXT);
    expect(sceneFingerprint(scene({ delivery: 'voiceover' }), CONTEXT)).toBe(base);
    const onScreen = sceneFingerprint(scene({ delivery: 'on_screen' }), CONTEXT);
    expect(onScreen).not.toBe(base);
    expect(sceneFingerprint(scene({ delivery: 'on_screen', speaker: 'the woman' }), CONTEXT)).not.toBe(onScreen);
  });

  it('stores who speaks only with narration, drops the voice-over default, and checks the values', () => {
    expect(speakerFields(scene({ delivery: 'on_screen', speaker: ' the   woman ' }))).toEqual({ delivery: 'on_screen', speaker: 'the woman' });
    expect(speakerFields(scene({ delivery: 'on_screen', speaker: '' }))).toEqual({ delivery: 'on_screen' });
    expect(speakerFields(scene({ delivery: 'voiceover', speaker: 'ignored' }))).toEqual({});
    expect(speakerFields(scene({ delivery: 'on_screen', voiceover: '  ' }))).toEqual({});
    const [fitted] = fitAdStudioScenes([scene({ delivery: 'on_screen', speaker: 'the woman' })], () => 'x');
    expect(fitted).toMatchObject({ delivery: 'on_screen', speaker: 'the woman' });
    expect(validateAdStudioScenes([scene({ delivery: 'shout' as never })])).toEqual([{ code: 'invalid_delivery', scene: 1 }]);
    expect(validateAdStudioScenes([scene({ delivery: 'on_screen', speaker: 'x'.repeat(201) })])).toEqual([{ code: 'speaker_too_long', scene: 1 }]);
  });
});
