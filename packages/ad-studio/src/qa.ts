import { z } from 'zod/v4';
import {
  AdStudioQuotaExceededError,
  assertAdStudioQuota,
  claimAdStudioClipQa,
  recordAdStudioClipQa,
  recordAdStudioUsage,
  type AdStudioClipModel,
  type AdStudioClipQaIssue,
} from '@growthos/firebase-orm-models';
import type { AdStudioScene } from '@growthos/shared';
import { AdStudioProviderError, type AdStudioReviewer } from './llm';
import { readAdStudioObject, type AdStudioMediaStorage } from './media-storage';

/**
 * The AI quality check of a rendered clip. Video models make mistakes that are embarrassing in an
 * ad - a stuttered or wrong word, a grammar slip, gibberish letters on a screen, a melted hand - so
 * before a clip is used, Gemini watches it: it writes down what is actually said, compares that with
 * the scene's narration, and looks for visual defects. A major problem marks the clip `issues`; the
 * autopilot then re-renders the scene (up to the project's retry count) and the Review step shows the
 * findings next to the scene.
 */

/** Clips are short (3-10 s); anything bigger than this is not a clip and is not sent. */
const MAX_CLIP_BYTES = 40 * 1024 * 1024;
const MAX_ISSUES = 12;

const QaIssueSchema = z.object({
  kind: z.enum(['audio', 'visual']),
  severity: z.enum(['major', 'minor']),
  detail: z.string(),
  atSeconds: z.number().nullable(),
});

export const AdStudioClipQaSchema = z.object({
  transcript: z.string(),
  issues: z.array(QaIssueSchema),
});

const LANGUAGE_NAMES: Record<string, string> = { he: 'Hebrew', en: 'English', ar: 'Arabic', ru: 'Russian', fr: 'French', es: 'Spanish', de: 'German' };

export function buildClipQaPrompt(scene: Pick<AdStudioScene, 'visualPrompt' | 'voiceover'>, language: string): { system: string; user: string } {
  const languageName = LANGUAGE_NAMES[language.toLowerCase()] ?? language;
  const narration = scene.voiceover.trim();
  return {
    system:
      'You check short AI-generated video clips for a video ad before a person sees them. Be strict about anything that would embarrass the brand in an ad, and never invent a problem you did not see or hear.',
    user: [
      `Language of the ad: ${languageName}.`,
      narration ? `Intended narration, word for word: "${narration}"` : 'Intended narration: none (no one should speak).',
      `Intended picture: ${scene.visualPrompt}`,
      '',
      '1) transcript: write exactly what is spoken in the clip, in the language spoken (empty if nothing is said).',
      '2) issues: every problem, each with kind (audio or visual), severity, a short detail a person can act on, and atSeconds when you can tell.',
      'Major audio problems: a missing, extra or different word compared with the intended narration; a word mispronounced so that a native speaker would notice; a stutter or a cut-off word; a grammar error (for example the wrong gender of a number); speech in another language.',
      'Minor audio problems: odd pacing or intonation, music too loud.',
      'Major visual problems: letters, words or numbers drawn in the picture that are gibberish or misspelled; a deformed face, hand or body (extra or missing fingers, melting features); objects that morph or appear from nowhere; a speaking mouth clearly out of sync with the narration.',
      'Minor visual problems: slight blur, small background artifacts, a small continuity slip.',
      'If you find nothing, return an empty issues list.',
    ].join('\n'),
  };
}

export interface CheckAdStudioClipParams {
  clip: AdStudioClipModel;
  /** The scene the clip renders, as it reads now; null when the scene was deleted (the check is then skipped). */
  scene: Pick<AdStudioScene, 'visualPrompt' | 'voiceover'> | null;
  language: string;
  reviewer: AdStudioReviewer | null;
  storage: AdStudioMediaStorage;
  /** The project's setting: off records the clip as skipped. */
  enabled: boolean;
  now?: Date;
}

/**
 * Checks one ready clip and records the verdict on it. Returns the clip as stored afterwards, or the
 * clip unchanged when another caller holds the check. Never throws for a provider or storage failure:
 * the verdict is then `error`, so nothing waits on a check that cannot run.
 */
export async function checkAdStudioClip(params: CheckAdStudioClipParams): Promise<AdStudioClipModel> {
  const { clip } = params;
  const now = params.now ?? new Date();
  const token = await claimAdStudioClipQa(clip, now);
  if (!token) return clip;
  const skip = () => recordAdStudioClipQa(clip, { status: 'skipped', issues: [], transcript: null, model: null }, now);
  if (!params.enabled || !params.reviewer || !params.scene || !clip.gcs_path) return skip();
  try {
    await assertAdStudioQuota({ organizationId: clip.organization_id, projectId: clip.project_id, kind: 'video_qa', units: 1, now });
  } catch (error) {
    if (error instanceof AdStudioQuotaExceededError) return skip();
    throw error;
  }
  const reviewer = params.reviewer;
  const usage = (outcome: 'succeeded' | 'failed', failureReason?: string) =>
    recordAdStudioUsage({
      organizationId: clip.organization_id,
      projectId: clip.project_id,
      kind: 'video_qa',
      provider: reviewer.provider,
      model: reviewer.model,
      units: 1,
      briefId: clip.brief_id,
      actorId: clip.requested_by,
      outcome,
      ...(failureReason ? { failureReason } : {}),
      now,
    });
  try {
    const bytes = await readAdStudioObject(params.storage, clip.gcs_path, MAX_CLIP_BYTES);
    const review = await reviewer.reviewJson({ ...buildClipQaPrompt(params.scene, params.language), schema: AdStudioClipQaSchema, media: { mimeType: 'video/mp4', data: bytes } });
    await usage('succeeded');
    const issues: AdStudioClipQaIssue[] = review.issues.slice(0, MAX_ISSUES).map((issue) => ({
      kind: issue.kind,
      severity: issue.severity,
      detail: issue.detail.trim().slice(0, 300),
      at_seconds: typeof issue.atSeconds === 'number' && Number.isFinite(issue.atSeconds) ? Math.max(0, Math.round(issue.atSeconds * 10) / 10) : null,
    }));
    return recordAdStudioClipQa(
      clip,
      { status: issues.some((issue) => issue.severity === 'major') ? 'issues' : 'passed', issues, transcript: review.transcript.trim().slice(0, 1000) || null, model: reviewer.model },
      now,
    );
  } catch (error) {
    const reason = error instanceof AdStudioProviderError ? error.code : 'error';
    await usage('failed', reason).catch(() => undefined);
    console.error('[ad-studio] clip quality check failed', { clipId: clip.id, reason, error: error instanceof Error ? error.message : String(error) });
    return recordAdStudioClipQa(clip, { status: 'error', issues: [], transcript: null, model: reviewer.model }, now);
  }
}
