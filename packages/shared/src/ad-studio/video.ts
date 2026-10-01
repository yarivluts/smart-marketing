import { AD_STUDIO_ASPECT_RATIO, AD_STUDIO_MAX_TOTAL_SECONDS, type AdStudioFormat, type AdStudioScene } from './scenes';
import { languageName } from './prompts';
import { isHebrewLanguage, spokenNarration } from './pronunciation';
import { referencePromptLines, referencesShowText, type AdStudioPromptReference } from './references';

/**
 * Ad Studio video (KAN-231): what each scene's clip is asked of the video model, how a clip is tied
 * to the version of the scene it was made from, and which clips make up the finished video. Pure,
 * so the API routes, the page and the tests all share one definition.
 *
 * Decision on on-screen text: the model is told never to render readable text (video models garble
 * letters, and Hebrew worst of all), and the assembled video carries no text overlay either - the
 * scene's `onScreenText` stays in the script for the person to add as a caption or text layer in
 * the ad platform. It is therefore not part of the prompt or of the fingerprint: editing it does
 * not make a clip out of date. The voiceover IS part of the prompt - Gemini Omni generates the
 * soundtrack with the picture, so the narration is spoken by the model in the ad language.
 */

/** The brief fields that shape every scene's clip. */
export interface AdStudioVideoContext {
  format: AdStudioFormat;
  /** BCP 47 code of the ad language; the narration is spoken in it. */
  language: string;
  /** What is being sold - repeated in every scene prompt so the scenes look like one ad. */
  productDescription: string;
  /**
   * The ad's narrator voice in words (see `voice.ts`), or null to let the model choose. Required on
   * purpose: every place that computes a fingerprint must pass it, or clips would look out of date.
   */
  voice: string | null;
}

const PRODUCT_CONTEXT_MAX = 300;

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/**
 * The text-to-video prompt for one scene. Every scene carries the same product context and style
 * line so separately generated clips read as one ad; the length is stated in seconds and as a
 * timecode because the API has no duration parameter; readable text is forbidden (see above),
 * except what an attached screen or opening frame shows. `references` describe the images sent with
 * the prompt, in their order (KAN-243).
 */
export function buildScenePrompt(
  scene: Pick<AdStudioScene, 'durationSeconds' | 'visualPrompt' | 'voiceover' | 'pronunciation' | 'delivery' | 'speaker'>,
  context: AdStudioVideoContext,
  references: readonly AdStudioPromptReference[] = [],
): string {
  const seconds = scene.durationSeconds;
  const frame = context.format === 'vertical' ? 'vertical 9:16 frame for phones' : 'horizontal 16:9 frame';
  const voiceover = spokenNarration(scene);
  const vocalized = Boolean(scene.pronunciation?.trim()) && voiceover.length > 0;
  const product = clip(oneLine(context.productDescription), PRODUCT_CONTEXT_MAX);
  const onScreen = scene.delivery === 'on_screen';
  const who = oneLine(scene.speaker ?? '');
  const language = languageName(context.language);
  // Read exactly as vocalized, when the scene has a pronunciation (KAN-239).
  const exactly = vocalized
    ? `, exactly these words and nothing else, pronouncing every word as written${isHebrewLanguage(context.language) ? ' - the Hebrew carries full nikud vowel marks that give the exact pronunciation' : ''}`
    : '';
  // The ad's one narrator voice, described the same way in every scene so the scenes sound alike.
  const voice = context.voice ? oneLine(context.voice) : null;
  const narrationLine = onScreen
    ? `Audio: ${who ? `${who} in the shot` : 'the person in the shot'} looks at the camera and says, in ${language}${exactly}: "${voiceover}". Their lips move in sync with every word. ${who ? 'No one else in the shot speaks.' : 'Only this one person speaks.'}${voice ? ` They speak with the voice of ${voice} - the same voice in every scene of this ad.` : ''} There is no off-screen narrator. Soft background music under the voice.`
    : `Audio: ${voice ? `a voice-over narrator - ${voice} - says` : 'a warm, clear voice-over narrator says'}, in ${language}${exactly}: "${voiceover}".${vocalized ? ' Say each word once, fluently, without repeating or stuttering.' : ''}${voice ? ' It is exactly the same narrator voice in every scene of this ad.' : ''} Soft background music under the voice. The narration is audio only: the narrator is never seen, and no one in the shot speaks or moves their lips as if talking.`;
  return [
    `[0-${seconds}s] ${oneLine(scene.visualPrompt)}`,
    `One continuous ${seconds}-second shot in a single unbroken scene, no scene cuts, in a ${frame}.`,
    `This shot is one scene of a short video ad for: ${product}. Keep the look consistent with the other scenes of the ad: the same polished commercial style, colour grading and lighting, and the same product, people and setting whenever they appear.`,
    ...referencePromptLines(references),
    voiceover
      ? narrationLine
      : 'Audio: background music and natural ambient sound that fit the mood. No speech.',
    referencesShowText(references)
      ? 'Apart from what the attached screen or opening frame shows, do not show any readable text, letters, numbers, captions, subtitles, logos or watermarks anywhere in the frame.'
      : 'Do not show any readable text, letters, numbers, captions, subtitles, logos or watermarks anywhere in the frame.',
  ].join('\n');
}

/**
 * The instruction sent for a conversational edit of a finished clip. The docs advise short edit
 * prompts that say to keep everything else; the no-text rule is repeated because each edit is a
 * new generation.
 */
export function buildSceneEditInstruction(instruction: string): string {
  return `${oneLine(instruction).replace(/[.!\s]+$/, '')}. Keep everything else the same. Do not add any readable text, captions or logos.`;
}

/** 32-bit FNV-1a over UTF-16 code units, from a given offset basis. */
function fnv1a(input: string, basis: number): number {
  let hash = basis >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A stable hash of everything that changes a scene's clip: its length, what the camera shows, the
 * narration, the frame and the ad language. A clip stores the fingerprint it was made from, so the
 * page can say "out of date" once any of these change. Scene order and on-screen text are left out
 * on purpose - reordering scenes or editing a caption does not need a re-render. Not a security
 * hash; it only has to differ when the inputs differ.
 */
export function sceneFingerprint(scene: Pick<AdStudioScene, 'durationSeconds' | 'visualPrompt' | 'voiceover' | 'pronunciation' | 'references' | 'delivery' | 'speaker'>, context: Pick<AdStudioVideoContext, 'format' | 'language' | 'voice'>): string {
  const pronunciation = oneLine(scene.pronunciation ?? '');
  const canonical = JSON.stringify([
    scene.durationSeconds,
    oneLine(scene.visualPrompt),
    oneLine(scene.voiceover),
    AD_STUDIO_ASPECT_RATIO[context.format] ?? context.format,
    context.language.trim().toLowerCase(),
    // Only when present, so every clip rendered before pronunciations existed stays current.
    ...(pronunciation ? [pronunciation] : []),
    // Who speaks, only for a person on screen: the voice-over default keeps every earlier fingerprint.
    ...(scene.delivery === 'on_screen' ? [{ delivery: 'on_screen', speaker: oneLine(scene.speaker ?? '') }] : []),
    // The narrator voice, only for a scene with narration and an ad that chose one.
    ...(context.voice && scene.voiceover.trim() ? [{ voice: oneLine(context.voice) }] : []),
    // The attached images and how each is used, also only when present (KAN-243).
    ...(scene.references?.length ? [{ references: scene.references.map((reference) => [reference.imageId, reference.use]) }] : []),
  ]);
  const high = fnv1a(canonical, 0x811c9dc5).toString(16).padStart(8, '0');
  const low = fnv1a(`${canonical}#`, 0x01000193).toString(16).padStart(8, '0');
  return `${high}${low}`;
}

export const AD_STUDIO_CLIP_STATUSES = ['generating', 'ready', 'failed'] as const;
export type AdStudioClipStatus = (typeof AD_STUDIO_CLIP_STATUSES)[number];

/** The parts of a clip that decide which one a scene uses. */
export interface AdStudioClipSummary {
  id: string;
  sceneId: string;
  version: number;
  status: AdStudioClipStatus;
  sceneFingerprint: string;
  durationSeconds: number;
}

/** Every clip of each scene, newest version first. */
export function clipsByScene<T extends AdStudioClipSummary>(clips: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const candidate of clips) {
    const list = grouped.get(candidate.sceneId) ?? [];
    list.push(candidate);
    grouped.set(candidate.sceneId, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => b.version - a.version);
  return grouped;
}

export type AdStudioSceneVideoState = 'none' | 'generating' | 'ready' | 'out_of_date' | 'failed';

export interface AdStudioSceneVideo<T extends AdStudioClipSummary = AdStudioClipSummary> {
  sceneId: string;
  /** The newest clip of any status - what the scene's panel shows first. */
  latest: T | null;
  /** The newest ready clip made from the scene as it is now - what the assembled video uses. */
  usable: T | null;
  state: AdStudioSceneVideoState;
}

/**
 * Where each scene's video stands. `ready` needs a ready clip made from the current scene;
 * `generating` wins over everything while a render or edit is in flight; a scene whose newest clip
 * failed but has an older usable one still reads as ready, since the video can be assembled.
 */
export function sceneVideoStates<T extends AdStudioClipSummary>(
  scenes: readonly Pick<AdStudioScene, 'id' | 'durationSeconds' | 'visualPrompt' | 'voiceover' | 'pronunciation' | 'references' | 'delivery' | 'speaker'>[],
  clips: readonly T[],
  context: Pick<AdStudioVideoContext, 'format' | 'language' | 'voice'>,
): AdStudioSceneVideo<T>[] {
  const grouped = clipsByScene(clips);
  return scenes.map((scene) => {
    const list = grouped.get(scene.id) ?? [];
    const fingerprint = sceneFingerprint(scene, context);
    const latest = list[0] ?? null;
    const usable = list.find((candidate) => candidate.status === 'ready' && candidate.sceneFingerprint === fingerprint) ?? null;
    let state: AdStudioSceneVideoState;
    if (list.some((candidate) => candidate.status === 'generating')) state = 'generating';
    else if (usable) state = 'ready';
    else if (!latest) state = 'none';
    else if (latest.status === 'failed') state = 'failed';
    else state = 'out_of_date';
    return { sceneId: scene.id, latest, usable, state };
  });
}

export interface AdStudioVideoProgress {
  scenes: number;
  /** Scenes with a usable (ready, current) clip. */
  rendered: number;
  generating: number;
  failed: number;
  outOfDate: number;
  /** True when every scene has a usable clip and the total fits the one-minute limit. */
  canAssemble: boolean;
  /** Seconds of video the assembled ad would run: each scene at its scripted length. */
  totalSeconds: number;
}

export function summarizeVideoProgress(states: readonly AdStudioSceneVideo[], scenes: readonly Pick<AdStudioScene, 'durationSeconds'>[]): AdStudioVideoProgress {
  const count = (state: AdStudioSceneVideoState) => states.filter((entry) => entry.state === state).length;
  const rendered = states.filter((entry) => entry.usable !== null).length;
  const totalSeconds = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  return {
    scenes: states.length,
    rendered,
    generating: count('generating'),
    failed: count('failed'),
    outOfDate: count('out_of_date'),
    canAssemble: states.length > 0 && rendered === states.length && totalSeconds <= AD_STUDIO_MAX_TOTAL_SECONDS,
    totalSeconds,
  };
}

/**
 * Seconds of video "render all" would request: every scene without a usable clip and nothing in
 * flight. Shown before starting so the daily limit is never a surprise.
 */
export function renderAllCost(states: readonly AdStudioSceneVideo[], scenes: readonly Pick<AdStudioScene, 'id' | 'durationSeconds'>[]): { sceneIds: string[]; seconds: number } {
  const pending = new Set(states.filter((entry) => entry.state === 'none' || entry.state === 'failed' || entry.state === 'out_of_date').map((entry) => entry.sceneId));
  const chosen = scenes.filter((scene) => pending.has(scene.id));
  return { sceneIds: chosen.map((scene) => scene.id), seconds: chosen.reduce((sum, scene) => sum + scene.durationSeconds, 0) };
}

/** The clips an assembly concatenates, in script order, each trimmed to its scene's length; null until every scene has a usable clip. */
export function assemblyPlan<T extends AdStudioClipSummary>(
  scenes: readonly Pick<AdStudioScene, 'id' | 'durationSeconds' | 'visualPrompt' | 'voiceover' | 'pronunciation' | 'references' | 'delivery' | 'speaker'>[],
  clips: readonly T[],
  context: Pick<AdStudioVideoContext, 'format' | 'language' | 'voice'>,
): { clip: T; sceneId: string; seconds: number }[] | null {
  if (scenes.length === 0) return null;
  const states = sceneVideoStates(scenes, clips, context);
  if (states.some((entry) => entry.usable === null)) return null;
  const plan = scenes.map((scene, index) => ({ clip: states[index].usable as T, sceneId: scene.id, seconds: scene.durationSeconds }));
  return plan.reduce((sum, entry) => sum + entry.seconds, 0) <= AD_STUDIO_MAX_TOTAL_SECONDS ? plan : null;
}
