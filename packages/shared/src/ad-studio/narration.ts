import { AD_STUDIO_SPEAKER_MAX, type AdStudioScene } from './scenes';

/**
 * Who narrates the whole video ad. Video models happily make a person in the shot start talking,
 * and a script writer left to itself switched to an on-screen speaker in the middle scenes, so the
 * ad sounded like a different speaker per scene. The mode is chosen once per ad and enforced in code
 * on every saved script:
 *
 * - `voiceover`: an off-screen narrator only, never seen; no one in the shot speaks. The default.
 * - `on_camera`: one presenter or character speaks to the camera in every scene with narration - the
 *   same person, described the same way, from the first narrated scene to the last.
 * - `mixed`: each scene says who speaks (only when the person asked for that).
 */
export const AD_STUDIO_NARRATION_MODES = ['voiceover', 'on_camera', 'mixed'] as const;
export type AdStudioNarrationMode = (typeof AD_STUDIO_NARRATION_MODES)[number];
export const DEFAULT_AD_STUDIO_NARRATION_MODE: AdStudioNarrationMode = 'voiceover';

export function isAdStudioNarrationMode(value: unknown): value is AdStudioNarrationMode {
  return typeof value === 'string' && (AD_STUDIO_NARRATION_MODES as readonly string[]).includes(value);
}

/**
 * The mode an ad's script follows: the one a person or agent chose, else the one the script writer
 * read in the brief, else - for an ad from before modes existed whose scenes already put someone on
 * screen - `mixed`, so those scenes are left as they were; otherwise voice-over.
 */
export function resolveNarrationMode(params: {
  chosen?: AdStudioNarrationMode | null;
  detected?: AdStudioNarrationMode | null;
  scenes?: readonly Pick<AdStudioScene, 'voiceover' | 'delivery'>[];
}): AdStudioNarrationMode {
  if (params.chosen) return params.chosen;
  if (params.detected) return params.detected;
  const legacyOnScreen = (params.scenes ?? []).some((scene) => scene.delivery === 'on_screen' && scene.voiceover.trim());
  return legacyOnScreen ? 'mixed' : DEFAULT_AD_STUDIO_NARRATION_MODE;
}

function oneLine(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, AD_STUDIO_SPEAKER_MAX);
}

/** The presenter of an on-camera ad: the speaker of the first narrated scene that names one. */
export function narrationPresenter(scenes: readonly Pick<AdStudioScene, 'voiceover' | 'speaker'>[]): string {
  return scenes.map((scene) => (scene.voiceover.trim() ? oneLine(scene.speaker) : '')).find(Boolean) ?? '';
}

/**
 * Makes a script follow its narration mode. `voiceover` clears every scene's on-screen delivery and
 * speaker; `on_camera` puts every scene with narration on screen with one speaker - `presenter` when
 * given, else the first one named in the script - and clears it from scenes without narration;
 * `mixed` leaves every scene as it is. Pure; other scene fields are untouched.
 */
export function applyNarrationMode<T extends Pick<AdStudioScene, 'voiceover' | 'delivery' | 'speaker'>>(scenes: readonly T[], mode: AdStudioNarrationMode, presenter?: string | null): T[] {
  if (mode === 'mixed') return scenes.map((scene) => ({ ...scene }));
  const speaker = mode === 'on_camera' ? oneLine(presenter) || narrationPresenter(scenes) : '';
  return scenes.map((scene) => {
    const { delivery: _delivery, speaker: _speaker, ...rest } = scene;
    if (mode === 'voiceover' || !scene.voiceover.trim()) return rest as T;
    return { ...rest, delivery: 'on_screen', ...(speaker ? { speaker } : {}) } as T;
  });
}

/**
 * The script writer's instructions for the narration mode. With a mode set, it is stated as a rule;
 * with none (automatic), the writer reads the brief and reports the mode it asks for - voice-over
 * unless the brief clearly asks for a presenter, spokesperson or character who talks on camera.
 */
export function narrationModeRules(mode: AdStudioNarrationMode | null): string[] {
  const voiceover = 'Narration mode voiceover: every line of narration is spoken by an off-screen voice-over narrator who is never seen. Set every scene\'s delivery to "voiceover" and leave speaker empty. No person in any shot talks, speaks to the camera, presents, or moves their lips as if talking - describe people reacting, using the product or listening instead.';
  const onCamera = 'Narration mode on_camera: one presenter or character speaks the narration to the camera in every scene that has narration, from the first to the last - never an off-screen voice, and never a different person mid-video. Set delivery to "on_screen" in every scene with narration and give the same speaker description in each (age, gender, look, clothing), and show that same person, described the same way, in those scenes\' visualPrompt.';
  const mixed = 'Narration mode mixed: decide per scene who speaks - delivery "voiceover" (an off-screen narrator) or "on_screen" (a person in the shot, named in speaker). Keep the same on-screen person throughout, as the brief describes.';
  if (mode === 'voiceover') return [voiceover];
  if (mode === 'on_camera') return [onCamera];
  if (mode === 'mixed') return [mixed];
  return [
    'narrationMode: read the brief and choose who narrates the ad. Answer "voiceover" unless the brief clearly asks for a presenter, spokesperson, host or character who talks to the camera (then "on_camera"), or explicitly asks for both a narrator and an on-screen speaker (then "mixed"). When in doubt, "voiceover".',
    `Follow the mode you chose. ${voiceover} ${onCamera}`,
  ];
}
