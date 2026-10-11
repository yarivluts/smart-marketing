import {
  AD_STUDIO_ASPECT_RATIO,
  AD_STUDIO_MAX_SCENES,
  AD_STUDIO_MAX_TOTAL_SECONDS,
  AD_STUDIO_SCENE_MAX_SECONDS,
  AD_STUDIO_SCENE_MIN_SECONDS,
  type AdStudioFormat,
  type AdStudioScene,
} from './scenes';
import { AD_COPY_RULES } from './copy';

/** What a person tells the studio about the ad they want. */
export interface AdStudioBriefInput {
  name: string;
  /** What the ad should achieve, in the person's words. */
  objective: string;
  /** What is being sold and to whom, in the person's words. */
  productDescription: string;
  landingPageUrl: string | null;
  format: AdStudioFormat;
  /** BCP 47 language the ad itself is written in (voiceover, on-screen text), e.g. "en" or "he". */
  language: string;
  /** The length the person asked for, at most 60 seconds. */
  targetSeconds: number;
}

/** Findings from the planning stage that the script should build on (KAN-230); absent before planning runs. */
export interface AdStudioScriptContext {
  audience?: string;
  messagingAngles?: string[];
  keywordThemes?: string[];
  landingPageSummary?: string;
}

export interface AdStudioPrompt {
  system: string;
  user: string;
}

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', he: 'Hebrew' };

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

const SCRIPT_RULES = [
  `The whole video runs at most ${AD_STUDIO_MAX_TOTAL_SECONDS} seconds; aim for the requested length.`,
  `Use between 1 and ${AD_STUDIO_MAX_SCENES} scenes. Each scene is ${AD_STUDIO_SCENE_MIN_SECONDS}-${AD_STUDIO_SCENE_MAX_SECONDS} whole seconds: every scene is generated separately by a text-to-video model, so each must stand alone as one continuous shot.`,
  'Open with a hook in the first scene; end with a clear call to action that matches the objective.',
  'visualPrompt describes only what the camera sees - subject, setting, action, camera movement, lighting, mood - in English, concretely enough for a video model. Never ask for readable text inside the footage; put words in onScreenText instead.',
  'voiceover and onScreenText are written in the ad language. Keep voiceover short enough to be spoken within the scene length. Leave a field empty rather than padding it.',
  'In voiceover, write numbers, prices, percentages and symbols out as words, in the form that agrees grammatically with the noun they count - a narrator model reads digits badly and gets their gender wrong.',
  'Do not invent facts about the product, prices, discounts, awards, statistics or testimonials. Use only what the brief and context state.',
];

/** The instructions for writing a full script from a brief. */
export function buildScriptPrompt(brief: AdStudioBriefInput, context: AdStudioScriptContext = {}): AdStudioPrompt {
  const contextLines = [
    context.landingPageSummary ? `Landing page summary: ${context.landingPageSummary}` : null,
    context.audience ? `Audience: ${context.audience}` : null,
    context.messagingAngles?.length ? `Messaging angles to build on: ${context.messagingAngles.join('; ')}` : null,
    context.keywordThemes?.length ? `What people search for: ${context.keywordThemes.join('; ')}` : null,
  ].filter((line): line is string => line !== null);

  return {
    system: [
      'You write scripts for short video ads that are generated scene by scene with an AI video model.',
      'Rules:',
      ...SCRIPT_RULES.map((rule) => `- ${rule}`),
      // Read at call time, not at module load: copy.ts imports this module (KAN-278).
      '- copy is the ad text that runs next to the finished video in the feed.',
      ...AD_COPY_RULES.map((rule) => `- ${rule}`),
    ].join('\n'),
    user: [
      `Ad name: ${brief.name}`,
      `Objective: ${brief.objective}`,
      `Product: ${brief.productDescription}`,
      brief.landingPageUrl ? `Landing page: ${brief.landingPageUrl}` : null,
      `Frame: ${brief.format} (${AD_STUDIO_ASPECT_RATIO[brief.format]})`,
      `Ad language: ${languageName(brief.language)}`,
      `Requested length: ${Math.min(brief.targetSeconds, AD_STUDIO_MAX_TOTAL_SECONDS)} seconds`,
      ...(contextLines.length ? ['', 'Context from the planning stage:', ...contextLines] : []),
      '',
      'Write the script.',
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  };
}

/** The instructions for rewriting one scene in place, keeping the rest of the script as context. */
export function buildSceneRewritePrompt(
  brief: AdStudioBriefInput,
  scenes: readonly AdStudioScene[],
  sceneIndex: number,
  instruction: string,
): AdStudioPrompt {
  const target = scenes[sceneIndex];
  const outline = scenes
    .map((scene, index) => `${index + 1}. [${scene.durationSeconds}s] ${scene.visualPrompt}${scene.voiceover ? ` | VO: ${scene.voiceover}` : ''}${scene.onScreenText ? ` | Text: ${scene.onScreenText}` : ''}`)
    .join('\n');
  return {
    system: [
      'You rewrite one scene of a short video ad script. Keep it consistent with the scenes around it.',
      'Rules:',
      ...SCRIPT_RULES.slice(1).map((rule) => `- ${rule}`),
      `- Keep the scene at ${target.durationSeconds} seconds unless the instruction asks otherwise.`,
    ].join('\n'),
    user: [
      `Ad: ${brief.name} - ${brief.objective}`,
      `Product: ${brief.productDescription}`,
      `Ad language: ${languageName(brief.language)}`,
      '',
      'Current script:',
      outline,
      '',
      `Rewrite scene ${sceneIndex + 1}. Instruction: ${instruction.trim() || 'Make it stronger.'}`,
    ].join('\n'),
  };
}
