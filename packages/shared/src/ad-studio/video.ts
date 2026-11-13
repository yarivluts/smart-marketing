import { AD_STUDIO_ASPECT_RATIO, AD_STUDIO_MAX_TOTAL_SECONDS, type AdStudioFormat, type AdStudioScene } from './scenes';
import { languageName } from './prompts';
import { isHebrewLanguage, spokenNarration } from './pronunciation';
import { referencePromptLines, referencesShowText, type AdStudioPromptReference } from './references';
import { AD_STUDIO_VISUAL_STYLE_PROMPTS, isDefaultVideoSettings, musicPromptLine, normalizeVideoSettings, type AdStudioVideoSettings } from './video-settings';

/**
 * Ad Studio video (KAN-231): what each scene's clip is asked of the video model, how a clip is tied
 * to the version of the scene it was made from, and which clips make up the finished video. Pure,
 * so the API routes, the page and the tests all share one definition.
 *
 * Decision on on-screen text: the model is told never to render readable text (video models garble
 * letters, and Hebrew worst of all), and the assembled video carries no scene text either - the
 * scene's `onScreenText` stays in the script for the person to add as a caption or text layer in
 * the ad platform. The only words on the finished video are the brand banner (logo, name, slogan)
 * drawn along its bottom edge by the studio, set in Heebo with correct bidi (see
 * AD_STUDIO_VIDEO_BRAND_BANNER). It is therefore not part of the prompt or of the fingerprint: editing it does
 * not make a clip out of date.
 *
 * Narration: a person speaking on camera (`delivery: 'on_screen'`) is part of the prompt - Gemini
 * Omni generates the soundtrack with the picture, so their lips move with the words. A voice-over is
 * NOT: told "no one in the shot speaks", the video model still had people mouthing the narration, so
 * a voice-over scene's clip is asked for as a silent shot of silent people (said inside the picture
 * description, and without the ad-language product description), the narration is spoken separately
 * by a text-to-speech model, and the clip's own sound is replaced by it entirely (see
 * `narrationIsSeparate` and the Ad Studio engine's narration step).
 */

/** The brief fields that shape every scene's clip. */
export interface AdStudioVideoContext {
  format: AdStudioFormat;
  /** BCP 47 code of the ad language; the narration is spoken in it. */
  language: string;
  /** What is being sold - repeated in every scene prompt but a voice-over one, so the scenes look like one ad. */
  productDescription: string;
  /**
   * The ad's narrator voice in words (see `voice.ts`), or null to let the model choose. Required on
   * purpose: every place that computes a fingerprint must pass it, or clips would look out of date.
   */
  voice: string | null;
  /**
   * The ad's advanced video settings (see `video-settings.ts`), or null for the defaults. Required on
   * purpose, like `voice`.
   */
  settings: AdStudioVideoSettings | null;
}

const PRODUCT_CONTEXT_MAX = 300;

/**
 * The brand banner on a video ad: logo, business name and slogan in a band along the very bottom of
 * the frame, as shares of the frame's height, laid over the footage after it is joined. The footage
 * itself fills the whole frame behind it - the scene prompts never mention the banner, because a
 * model told a strip "covers the lower part" painted an empty band there instead of the scene.
 */
export const AD_STUDIO_VIDEO_BRAND_BANNER: Record<AdStudioFormat, { top: number; height: number }> = {
  vertical: { top: 0.9, height: 0.1 },
  horizontal: { top: 0.86, height: 0.14 },
};

/**
 * A clip still generating after this is given up on (`timed_out`) so the person can try again. Renders
 * take one to three minutes; the old 30 minutes left a stuck scene spinning for half an hour.
 */
export const AD_STUDIO_CLIP_TIMEOUT_MS = 15 * 60_000;
/** After this a generating clip is shown as slow, with when it will be stopped. */
export const AD_STUDIO_CLIP_SLOW_MS = 6 * 60_000;

/** Whether a clip requested at `requestedOn` has been generating for longer than usual at `now`. */
export function isClipSlow(requestedOn: string, now: Date): boolean {
  return now.getTime() - new Date(requestedOn).getTime() > AD_STUDIO_CLIP_SLOW_MS;
}

/** How opaque the banner's band is: solid enough to read on any footage, with the scene faintly behind it. */
export const AD_STUDIO_VIDEO_BRAND_BANNER_OPACITY = 0.95;

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** Every scene is footage only, filling the whole frame. */
export const FULL_FRAME_LINE = 'Full-bleed footage to every edge, no bars or blank bands.';

/** The words in the clip are added afterwards (the brand banner), never drawn by the model. */
export const NO_TEXT_RULE = 'do not show any readable text, letters, numbers, captions, subtitles, titles, logos, signs or watermarks anywhere in the frame';

/**
 * A voice-over scene's clip carries no speech at all: the narration is added afterwards. Said in the
 * render prompt and again in every edit instruction, since each edit is a new generation.
 */
export const NO_SPEECH_RULE =
  'No speech of any kind: no narration, no dialogue, no voices, no singing with words. No one in the shot talks, and no one moves their lips as if speaking - mouths stay closed or relaxed.';

/**
 * Said inside the picture description itself, right after the scene's own words, for a voice-over
 * scene: it gives the people something to do other than talk. Told only "no one speaks" in a later
 * audio line, Gemini Omni still had a mother and child chatting; with this line (and a silent audio
 * line) a live test of the same scene came back with closed mouths every time.
 */
export const SILENT_PEOPLE_LINE =
  'Everyone in the shot stays silent the whole time with their lips closed: they listen, smile, nod and react with their faces and hands, and never talk to each other or to the camera.';

/**
 * The audio asked of a voice-over scene's clip. The clip's own sound is discarded when the narration
 * is mixed on (see the Ad Studio engine's narration mix), so the model is asked for silence rather
 * than music: a soundtrack the model is not composing is one it is not tempted to fill with voices.
 */
export const VOICE_OVER_AUDIO_LINE = `Audio: a silent shot - no speech, no dialogue, no voices, no narration, no music; at most faint room tone. ${NO_SPEECH_RULE}`;

/**
 * Whether a scene's narration is spoken by the text-to-speech narrator and mixed onto a speechless
 * clip, rather than generated with the picture: every voice-over scene that has narration. A person
 * on camera (`on_screen`) keeps speaking in the clip itself so the lips match the words.
 */
export function narrationIsSeparate(scene: Pick<AdStudioScene, 'voiceover' | 'delivery'>): boolean {
  return scene.delivery !== 'on_screen' && scene.voiceover.trim().length > 0;
}

/**
 * The text-to-video prompt for one scene. Every scene carries the same style line (and, except a
 * voice-over scene, the same product context) so separately generated clips read as one ad; the length is stated in seconds and as a
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
  const settings = normalizeVideoSettings(context.settings);
  const music = musicPromptLine(settings, true);
  // A voice-over is never sent to the video model: the clip comes back silent, with silent people,
  // and the narration is spoken separately and mixed on afterwards (see the file comment).
  const separate = narrationIsSeparate(scene);
  const audioLine = !voiceover
    ? musicPromptLine(settings, false)
    : onScreen
      ? `Audio: ${who ? `${who} in the shot` : 'the person in the shot'} looks at the camera and says, in ${language}${exactly}: "${voiceover}". Each word once, fluently, without repeating or stuttering. Their lips move in sync with every word. ${who ? 'No one else in the shot speaks.' : 'Only this one person speaks.'}${voice ? ` They speak with the voice of ${voice} - the same voice in every scene of this ad.` : ''} There is no off-screen narrator. ${music}`
      : VOICE_OVER_AUDIO_LINE;
  // A voice-over scene leaves the product description out: it is usually written in the ad language
  // (Hebrew, for most ads here), and a live test with it verbatim brought voices back into the clip.
  const adFor = separate ? 'a short video ad' : `a short video ad for: ${product}`;
  return [
    `[0-${seconds}s] ${oneLine(scene.visualPrompt)}${separate ? ` ${SILENT_PEOPLE_LINE}` : ''}`,
    `One continuous ${seconds}-second shot in a single unbroken scene, no scene cuts, in a ${frame}.`,
    `This shot is one scene of ${adFor}. Keep the look consistent with the other scenes of the ad: ${AD_STUDIO_VISUAL_STYLE_PROMPTS[settings.style]}, colour grading and lighting, and the same product, people and setting whenever they appear.`,
    ...referencePromptLines(references),
    // Full bleed. The brand banner is laid over the bottom afterwards; it is deliberately not
    // mentioned - told a strip covers the lower part, the model painted an empty band there.
    FULL_FRAME_LINE,
    audioLine,
    referencesShowText(references)
      ? `Apart from what the attached screen or opening frame shows, ${NO_TEXT_RULE}.`
      : // Video models fill a visible phone or laptop screen with invented, garbled writing (the AI
        // check keeps catching it): unless an attached image is the screen, keep every screen unreadable.
        `${NO_TEXT_RULE.charAt(0).toUpperCase()}${NO_TEXT_RULE.slice(1)}; any phone or computer screen faces away or is out of focus.`,
    ...(settings.avoid ? [`Never show any of these anywhere in the video: ${settings.avoid}.`] : []),
  ].join('\n');
}

/**
 * The instruction sent for a conversational edit of a finished clip. The docs advise short edit
 * prompts that say to keep everything else; the no-text rule is repeated because each edit is a
 * new generation, and so is the no-speech rule for a clip whose narration is mixed on separately.
 */
export function buildSceneEditInstruction(instruction: string, options: { speechless?: boolean } = {}): string {
  return `${oneLine(instruction).replace(/[.!\s]+$/, '')}. Keep everything else the same. Do not add any readable text, captions or logos, and keep the footage full-bleed to every edge.${options.speechless ? ` ${SILENT_PEOPLE_LINE} ${NO_SPEECH_RULE}` : ''}`;
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
export function sceneFingerprint(scene: Pick<AdStudioScene, 'durationSeconds' | 'visualPrompt' | 'voiceover' | 'pronunciation' | 'references' | 'delivery' | 'speaker'>, context: Pick<AdStudioVideoContext, 'format' | 'language' | 'voice' | 'settings'>): string {
  const pronunciation = oneLine(scene.pronunciation ?? '');
  const settings = normalizeVideoSettings(context.settings);
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
    // A voice-over mixed on separately onto a silent clip of silent people: clips whose narration the
    // video model spoke, and the first separate-narration clips (people still talking, model audio
    // ducked under the narration), are out of date.
    ...(narrationIsSeparate(scene) ? [{ narration: 'separate', silent: 2 }] : []),
    // The narrator voice, only for a scene with narration and an ad that chose one.
    ...(context.voice && scene.voiceover.trim() ? [{ voice: oneLine(context.voice) }] : []),
    // The attached images and how each is used, also only when present (KAN-243).
    ...(scene.references?.length ? [{ references: scene.references.map((reference) => [reference.imageId, reference.use]) }] : []),
    // The advanced video settings, only when changed from the defaults.
    ...(isDefaultVideoSettings(settings) ? [] : [{ settings: [settings.resolution, settings.style, settings.music, settings.musicDescription ?? '', settings.avoid ?? ''] }]),
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
  /** The version the person chose for the video over newer ones. */
  chosen?: boolean;
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
  /** What the assembled video uses: the version the person chose, else the newest ready clip of the scene as it is now. */
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
  context: Pick<AdStudioVideoContext, 'format' | 'language' | 'voice' | 'settings'>,
): AdStudioSceneVideo<T>[] {
  const grouped = clipsByScene(clips);
  return scenes.map((scene) => {
    const list = grouped.get(scene.id) ?? [];
    const fingerprint = sceneFingerprint(scene, context);
    const latest = list[0] ?? null;
    const current = (candidate: T) => candidate.status === 'ready' && candidate.sceneFingerprint === fingerprint;
    // A chosen version wins while it is still current; a changed scene falls back to the newest current clip.
    const usable = list.find((candidate) => candidate.chosen && current(candidate)) ?? list.find(current) ?? null;
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
  context: Pick<AdStudioVideoContext, 'format' | 'language' | 'voice' | 'settings'>,
): { clip: T; sceneId: string; seconds: number }[] | null {
  if (scenes.length === 0) return null;
  const states = sceneVideoStates(scenes, clips, context);
  if (states.some((entry) => entry.usable === null)) return null;
  const plan = scenes.map((scene, index) => ({ clip: states[index].usable as T, sceneId: scene.id, seconds: scene.durationSeconds }));
  return plan.reduce((sum, entry) => sum + entry.seconds, 0) <= AD_STUDIO_MAX_TOTAL_SECONDS ? plan : null;
}
