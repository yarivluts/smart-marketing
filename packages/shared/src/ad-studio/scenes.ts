/**
 * Ad Studio (KAN-229): the rules every video script obeys, whoever wrote it - the AI or a person
 * editing it. A video is at most {@link AD_STUDIO_MAX_TOTAL_SECONDS} long and is made of scenes;
 * each scene is one Gemini Omni generation, which the API bounds to 3-10 seconds per call, so a
 * scene's length is bounded the same way. Pure: no I/O, so the UI, the API routes and the tests
 * all apply the identical rules.
 */

/** The longest a finished video may run. */
export const AD_STUDIO_MAX_TOTAL_SECONDS = 60;
/** Gemini Omni generates 3-10 seconds per call; one scene is one call. */
export const AD_STUDIO_SCENE_MIN_SECONDS = 3;
export const AD_STUDIO_SCENE_MAX_SECONDS = 10;
/** Enough for 60 seconds at the 5-second pace short ads usually cut at, with room for a few 3-second beats. */
export const AD_STUDIO_MAX_SCENES = 15;

/**
 * The two frames Gemini Omni renders. Vertical covers Facebook/Instagram Reels and Stories and
 * YouTube Shorts; horizontal covers YouTube in-stream and landscape placements.
 */
export const AD_STUDIO_FORMATS = ['vertical', 'horizontal'] as const;
export type AdStudioFormat = (typeof AD_STUDIO_FORMATS)[number];

export const AD_STUDIO_ASPECT_RATIO: Record<AdStudioFormat, '9:16' | '16:9'> = {
  vertical: '9:16',
  horizontal: '16:9',
};

export function isAdStudioFormat(value: unknown): value is AdStudioFormat {
  return typeof value === 'string' && (AD_STUDIO_FORMATS as readonly string[]).includes(value);
}

export interface AdStudioScene {
  /** Stable across edits and reorders, so a rendered clip stays attached to its scene. */
  id: string;
  durationSeconds: number;
  /** What the camera shows - the prompt the video model receives. */
  visualPrompt: string;
  /** Spoken narration, if any. */
  voiceover: string;
  /**
   * How the narrator says the voiceover, when it differs from the written words: for Hebrew, the
   * same words with full nikud and numbers written out (see `pronunciation.ts`). Absent when none.
   */
  pronunciation?: string;
  /** Text burned into the frame, if any. */
  onScreenText: string;
}

export type AdStudioSceneIssueCode =
  | 'no_scenes'
  | 'too_many_scenes'
  | 'total_too_long'
  | 'scene_too_short'
  | 'scene_too_long'
  | 'scene_not_whole_seconds'
  | 'empty_visual_prompt'
  | 'pronunciation_too_long'
  | 'duplicate_scene_id';

/** Generous for a 10-second line with vowel points (which roughly double its length). */
export const AD_STUDIO_PRONUNCIATION_MAX = 1000;

export interface AdStudioSceneIssue {
  code: AdStudioSceneIssueCode;
  /** The scene the issue is about (1-based position), absent for whole-script issues. */
  scene?: number;
}

export function totalSceneSeconds(scenes: readonly Pick<AdStudioScene, 'durationSeconds'>[]): number {
  return scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
}

/** Every rule a script breaks; empty when it can be saved and rendered. */
export function validateAdStudioScenes(scenes: readonly AdStudioScene[]): AdStudioSceneIssue[] {
  const issues: AdStudioSceneIssue[] = [];
  if (scenes.length === 0) issues.push({ code: 'no_scenes' });
  if (scenes.length > AD_STUDIO_MAX_SCENES) issues.push({ code: 'too_many_scenes' });
  if (totalSceneSeconds(scenes) > AD_STUDIO_MAX_TOTAL_SECONDS) issues.push({ code: 'total_too_long' });
  const seen = new Set<string>();
  scenes.forEach((scene, index) => {
    const position = index + 1;
    if (!Number.isInteger(scene.durationSeconds)) issues.push({ code: 'scene_not_whole_seconds', scene: position });
    if (scene.durationSeconds < AD_STUDIO_SCENE_MIN_SECONDS) issues.push({ code: 'scene_too_short', scene: position });
    if (scene.durationSeconds > AD_STUDIO_SCENE_MAX_SECONDS) issues.push({ code: 'scene_too_long', scene: position });
    if (scene.visualPrompt.trim().length === 0) issues.push({ code: 'empty_visual_prompt', scene: position });
    if ((scene.pronunciation ?? '').trim().length > AD_STUDIO_PRONUNCIATION_MAX) issues.push({ code: 'pronunciation_too_long', scene: position });
    if (seen.has(scene.id)) issues.push({ code: 'duplicate_scene_id', scene: position });
    seen.add(scene.id);
  });
  return issues;
}

function clampDuration(seconds: number): number {
  const whole = Math.round(Number.isFinite(seconds) ? seconds : AD_STUDIO_SCENE_MIN_SECONDS);
  return Math.min(AD_STUDIO_SCENE_MAX_SECONDS, Math.max(AD_STUDIO_SCENE_MIN_SECONDS, whole));
}

/**
 * Makes a generated script legal instead of trusting the model with arithmetic: durations become
 * whole seconds within 3-10, scenes past {@link AD_STUDIO_MAX_SCENES} are dropped, and while the
 * total exceeds 60 seconds the longest scene loses a second (never below 3); if every scene is
 * already at 3 seconds and it still runs long, trailing scenes are dropped. Text is trimmed and ids
 * are made unique. The result always passes {@link validateAdStudioScenes} unless a visual prompt
 * is empty, which the caller must treat as a failed generation rather than invent content for.
 */
export function fitAdStudioScenes(scenes: readonly AdStudioScene[], makeId: () => string): AdStudioScene[] {
  const seen = new Set<string>();
  const fitted = scenes.slice(0, AD_STUDIO_MAX_SCENES).map((scene) => {
    let id = scene.id.trim();
    if (id.length === 0 || seen.has(id)) id = makeId();
    seen.add(id);
    const pronunciation = (scene.pronunciation ?? '').trim();
    return {
      id,
      durationSeconds: clampDuration(scene.durationSeconds),
      visualPrompt: scene.visualPrompt.trim(),
      voiceover: scene.voiceover.trim(),
      ...(pronunciation ? { pronunciation } : {}),
      onScreenText: scene.onScreenText.trim(),
    };
  });
  while (totalSceneSeconds(fitted) > AD_STUDIO_MAX_TOTAL_SECONDS) {
    const longest = fitted.reduce((best, scene, index) => (scene.durationSeconds > fitted[best].durationSeconds ? index : best), 0);
    if (fitted[longest].durationSeconds > AD_STUDIO_SCENE_MIN_SECONDS) {
      fitted[longest] = { ...fitted[longest], durationSeconds: fitted[longest].durationSeconds - 1 };
    } else {
      fitted.pop();
    }
  }
  return fitted;
}
