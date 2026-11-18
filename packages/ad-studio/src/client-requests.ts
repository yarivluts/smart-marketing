import { z } from 'zod/v4';
import {
  AD_STUDIO_IMAGE_FORMATS,
  AD_STUDIO_MAX_IMAGE_CONCEPTS,
  AD_STUDIO_MAX_TOTAL_SECONDS,
  AD_STUDIO_VIDEO_INSTRUCTIONS_MAX,
  AD_STUDIO_VOICE_PRESETS,
  AD_SHARE_PROPOSAL_KINDS,
  fitAdCopy,
  fitAdStudioImageConcepts,
  fitAdStudioScenes,
  fitSearchAd,
  isAdStudioFormat,
  isAdStudioImageFormat,
  isAdStudioVoicePreset,
  isAdShareProposalKind,
  type AdShareFeedbackItem,
  type AdShareProposalChanges,
  type AdShareProposalKind,
  type AdShareProposalView,
  type AdStudioAdCopy,
  type AdStudioImageFormat,
} from '@growthos/shared';
import {
  adStudioBriefInput,
  createAdStudioBrief,
  getAdShareProposal,
  getAdStudioBrandKit,
  getAdStudioBrief,
  listAdShareFeedbackForProject,
  listAdShareProposals,
  listAdStudioBriefs,
  newAdStudioSceneId,
  saveAdShareProposals,
  saveAdStudioCopy,
  saveAdStudioImageConcepts,
  saveAdStudioSearchAd,
  saveAdStudioVideoSettings,
  saveAdStudioVoice,
  updateAdShareFeedbackStatus,
  updateAdShareProposalOutcome,
  updateAdStudioBriefDetails,
  type AdStudioBriefModel,
  type AdStudioRunModel,
  type CreateAdShareProposalInput,
} from '@growthos/firebase-orm-models';
import { startAdStudioAutopilot } from './autopilot';
import { type AdStudioLlm } from './llm';
import { meteredCall, type AdStudioCallContext } from './metering';
import { ensureOrm } from './runtime';
import { saveAdStudioScriptWithPronunciation } from './vocalize';

const ProposalSceneSchema = z.object({
  durationSeconds: z.number(),
  visualPrompt: z.string(),
  voiceover: z.string(),
  onScreenText: z.string(),
});

const ProposalConceptSchema = z.object({
  headline: z.string(),
  visualPrompt: z.string(),
  formats: z.array(z.string()),
  headlineCopy: z.string().optional(),
  primaryTextCopy: z.string().optional(),
  descriptionCopy: z.string().optional(),
});

const RawProposalSchema = z.object({
  feedbackIds: z.array(z.string()),
  clientQuote: z.string(),
  kind: z.enum(AD_SHARE_PROPOSAL_KINDS),
  briefId: z.string().nullable().optional(),
  title: z.string(),
  summary: z.string(),
  rationale: z.string(),
  // Flat optional change fields so JSON schema works uniformly across Gemini & Anthropic.
  name: z.string().optional(),
  objective: z.string().optional(),
  productDescription: z.string().optional(),
  landingPageUrl: z.string().nullable().optional(),
  format: z.string().optional(),
  language: z.string().optional(),
  targetSeconds: z.number().optional(),
  videoInstructions: z.string().nullable().optional(),
  voicePreset: z.string().optional(),
  videoHeadlineCopy: z.string().optional(),
  videoPrimaryTextCopy: z.string().optional(),
  videoDescriptionCopy: z.string().optional(),
  scenes: z.array(ProposalSceneSchema).optional(),
  conceptsMode: z.enum(['replace_all', 'append', 'update_first']).optional(),
  concepts: z.array(ProposalConceptSchema).optional(),
  searchHeadlines: z.array(z.string()).optional(),
  searchDescriptions: z.array(z.string()).optional(),
  searchPath1: z.string().optional(),
  searchPath2: z.string().optional(),
});

const ProposedChangesListSchema = z.object({
  proposals: z.array(RawProposalSchema).min(1).max(10),
});

type RawProposal = z.infer<typeof RawProposalSchema>;

function pickManagerLanguageName(locale?: string): string {
  return locale?.toLowerCase().startsWith('he') ? 'Hebrew' : 'English';
}

function summarizeBriefForPlanner(brief: AdStudioBriefModel): Record<string, unknown> {
  return {
    id: brief.id,
    name: brief.name,
    objective: brief.objective,
    productDescription: brief.product_description,
    landingPageUrl: brief.landing_page_url ?? null,
    format: brief.video_format,
    language: brief.language,
    targetSeconds: brief.target_seconds,
    videoInstructions: brief.video_settings?.instructions ?? null,
    voicePreset: brief.narrator_voice?.preset ?? null,
    scenes: (brief.scenes ?? []).slice(0, 6).map((s, idx) => ({
      index: idx + 1,
      seconds: s.durationSeconds,
      visualPrompt: s.visualPrompt.slice(0, 140),
      voiceover: s.voiceover.slice(0, 140),
      onScreenText: s.onScreenText.slice(0, 80),
    })),
    imageConcepts: (brief.image_concepts ?? []).slice(0, 6).map((c) => ({
      id: c.id,
      headline: c.headline,
      visualPrompt: c.visualPrompt.slice(0, 120),
      formats: c.formats,
    })),
    hasSearchAd: Boolean(brief.search_ad),
  };
}

function pickFeedbackToAnalyze(
  allFeedback: readonly AdShareFeedbackItem[],
  requestedIds?: readonly string[],
): AdShareFeedbackItem[] {
  if (requestedIds && requestedIds.length > 0) {
    const wanted = new Set(requestedIds);
    return allFeedback.filter((item) => wanted.has(item.id) && item.status !== 'sent_to_client');
  }
  return allFeedback.filter((item) => item.status === 'open' && item.verdict !== 'approved');
}

function clampSeconds(seconds: number | undefined, fallback: number): number {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return fallback;
  return Math.min(AD_STUDIO_MAX_TOTAL_SECONDS, Math.max(10, Math.round(seconds)));
}

function buildCopyIfPresent(
  headline?: string,
  primaryText?: string,
  description?: string,
): AdStudioAdCopy | undefined {
  if (!headline?.trim() && !primaryText?.trim() && !description?.trim()) return undefined;
  return fitAdCopy({
    headline: headline ?? '',
    primaryText: primaryText ?? '',
    description: description ?? '',
  }) ?? undefined;
}

function normalizeHttpUrlOrNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

function sanitizeProposal(
  raw: RawProposal,
  eligibleFeedback: readonly AdShareFeedbackItem[],
  briefById: ReadonlyMap<string, AdStudioBriefModel>,
  defaultBrief: AdStudioBriefModel | undefined,
): CreateAdShareProposalInput {
  const feedbackById = new Map(eligibleFeedback.map((f) => [f.id, f]));
  const matchedFeedbackIds = [...new Set(raw.feedbackIds.filter((id) => feedbackById.has(id)))];
  const feedbackIds = matchedFeedbackIds.length > 0 ? matchedFeedbackIds : [eligibleFeedback[0].id];
  const primaryFeedback = feedbackById.get(feedbackIds[0]) ?? eligibleFeedback[0];

  let kind: AdShareProposalKind = isAdShareProposalKind(raw.kind) ? raw.kind : 'update_brief_settings';
  let resolvedBrief: AdStudioBriefModel | null = null;

  if (kind !== 'create_new_brief') {
    if (raw.briefId && briefById.has(raw.briefId)) {
      resolvedBrief = briefById.get(raw.briefId) ?? null;
    } else if (primaryFeedback.briefId && briefById.has(primaryFeedback.briefId)) {
      resolvedBrief = briefById.get(primaryFeedback.briefId) ?? null;
    } else if (defaultBrief) {
      resolvedBrief = defaultBrief;
    } else {
      kind = 'create_new_brief';
    }
  }

  const changes: AdShareProposalChanges = {};
  if (kind === 'update_brief_settings' || kind === 'create_new_brief') {
    if (raw.name?.trim()) changes.name = raw.name.trim().slice(0, 120);
    if (raw.objective?.trim()) changes.objective = raw.objective.trim().slice(0, 400);
    if (raw.productDescription?.trim()) changes.productDescription = raw.productDescription.trim().slice(0, 1000);
    const cleanedUrl = normalizeHttpUrlOrNull(raw.landingPageUrl);
    if (cleanedUrl !== undefined) changes.landingPageUrl = cleanedUrl;
    if (isAdStudioFormat(raw.format)) changes.format = raw.format;
    if (raw.language?.trim() && /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(raw.language.trim())) {
      changes.language = raw.language.trim().toLowerCase();
    }
    if (typeof raw.targetSeconds === 'number') {
      changes.targetSeconds = clampSeconds(raw.targetSeconds, resolvedBrief?.target_seconds ?? 15);
    }
    if (raw.videoInstructions !== undefined) {
      changes.videoInstructions = raw.videoInstructions
        ? raw.videoInstructions.trim().slice(0, AD_STUDIO_VIDEO_INSTRUCTIONS_MAX)
        : null;
    }
    if (isAdStudioVoicePreset(raw.voicePreset)) changes.voicePreset = raw.voicePreset;
    const videoCopy = buildCopyIfPresent(raw.videoHeadlineCopy, raw.videoPrimaryTextCopy, raw.videoDescriptionCopy);
    if (videoCopy) changes.videoCopy = videoCopy;

    if (kind === 'create_new_brief') {
      changes.name = changes.name || 'New client-requested ad';
      changes.objective = changes.objective || primaryFeedback.comment.slice(0, 240);
      changes.productDescription =
        changes.productDescription || defaultBrief?.product_description || primaryFeedback.comment.slice(0, 400);
      changes.format = changes.format ?? defaultBrief?.video_format ?? 'vertical';
      changes.language = changes.language ?? defaultBrief?.language ?? 'he';
      changes.targetSeconds = changes.targetSeconds ?? 15;
    }
  }

  if (kind === 'update_video_script' || (kind === 'create_new_brief' && raw.scenes?.length)) {
    const cleanScenes = (raw.scenes ?? [])
      .filter((s) => s.visualPrompt.trim().length > 0)
      .slice(0, 15)
      .map((s) => ({
        durationSeconds: Math.min(10, Math.max(3, Math.round(Number.isFinite(s.durationSeconds) ? s.durationSeconds : 5))),
        visualPrompt: s.visualPrompt.trim().slice(0, 700),
        voiceover: (s.voiceover ?? '').trim().slice(0, 400),
        onScreenText: (s.onScreenText ?? '').trim().slice(0, 160),
      }));
    if (cleanScenes.length > 0) {
      changes.scenes = cleanScenes;
    } else if (kind === 'update_video_script') {
      kind = 'update_brief_settings';
      changes.videoInstructions = raw.summary.slice(0, 500);
    }
  }

  if (kind === 'update_image_concepts' || (kind === 'create_new_brief' && raw.concepts?.length)) {
    const cleanConcepts = (raw.concepts ?? [])
      .filter((c) => c.visualPrompt.trim().length > 0)
      .slice(0, AD_STUDIO_MAX_IMAGE_CONCEPTS)
      .map((c) => {
        const validFormats = c.formats.filter(isAdStudioImageFormat);
        const formats: AdStudioImageFormat[] = validFormats.length > 0 ? validFormats : ['square'];
        const copy = buildCopyIfPresent(c.headlineCopy, c.primaryTextCopy, c.descriptionCopy);
        return {
          headline: (c.headline ?? '').trim().slice(0, 40),
          visualPrompt: c.visualPrompt.trim().slice(0, 700),
          formats,
          ...(copy ? { copy } : {}),
        };
      });
    if (cleanConcepts.length > 0) {
      changes.mode = raw.conceptsMode ?? 'update_first';
      changes.concepts = cleanConcepts;
    } else if (kind === 'update_image_concepts') {
      kind = 'update_brief_settings';
      changes.videoInstructions = raw.summary.slice(0, 500);
    }
  }

  if (kind === 'update_search_ad') {
    const fitted = fitSearchAd({
      headlines: raw.searchHeadlines ?? [],
      descriptions: raw.searchDescriptions ?? [],
      path1: raw.searchPath1 ?? '',
      path2: raw.searchPath2 ?? '',
    });
    changes.headlines = fitted.headlines;
    changes.descriptions = fitted.descriptions;
    changes.path1 = fitted.path1;
    changes.path2 = fitted.path2;
  }

  return {
    feedbackIds,
    clientQuote: (raw.clientQuote || primaryFeedback.comment).trim(),
    kind,
    briefId: resolvedBrief ? resolvedBrief.id : null,
    briefName: resolvedBrief ? resolvedBrief.name : null,
    title: raw.title.trim() || raw.summary.trim().slice(0, 80),
    summary: raw.summary.trim(),
    rationale: raw.rationale.trim(),
    changes,
  };
}

export interface ProposeFromFeedbackResult {
  proposals: AdShareProposalView[];
  analyzedFeedbackCount: number;
}

/**
 * Translates client comments & improvement requests into concrete, reviewable Ad Studio change
 * proposals stored with `status: 'pending'`. Never modifies creatives until the manager approves.
 */
export async function proposeChangesFromClientFeedback(
  ctx: AdStudioCallContext & { feedbackIds?: readonly string[]; targetLocale?: string },
): Promise<ProposeFromFeedbackResult> {
  await ensureOrm();
  const [allFeedback, briefs, brandKit] = await Promise.all([
    listAdShareFeedbackForProject(ctx.organizationId, ctx.projectId),
    listAdStudioBriefs(ctx.organizationId, ctx.projectId),
    getAdStudioBrandKit(ctx.organizationId, ctx.projectId),
  ]);

  const eligible = pickFeedbackToAnalyze(allFeedback, ctx.feedbackIds);
  if (eligible.length === 0) {
    return { proposals: [], analyzedFeedbackCount: 0 };
  }

  const managerLang = pickManagerLanguageName(ctx.targetLocale ?? briefs[0]?.language);
  const system = [
    'You are an experienced paid-media creative director helping an agency manager act on external client feedback.',
    `Write every proposal title, summary, and rationale in ${managerLang} so the manager can approve or decline them immediately.`,
    'ALWAYS write image/video visualPrompt values in clear, detailed English for image and video generation models, while keeping ad copy, headlines, voiceover, onScreenText, and Search ad lines in each ad brief language (usually Hebrew or English as shown on the brief).',
    'Never invent unrelated work. Produce concrete proposals mapped strictly to existing briefIds when modifying existing ads, or kind "create_new_brief" with briefId null when the client explicitly asks for a new ad/angle/campaign.',
    `Allowed voicePreset values: ${AD_STUDIO_VOICE_PRESETS.join(', ')}. Allowed image formats: ${AD_STUDIO_IMAGE_FORMATS.join(', ')}.`,
  ].join('\n');

  const user = JSON.stringify({
    brandKit: {
      brandName: brandKit.brandName,
      slogan: brandKit.slogan,
      toneOfVoice: brandKit.toneOfVoice,
      avoidWords: brandKit.avoidWords,
    },
    existingBriefs: briefs.map(summarizeBriefForPlanner),
    clientFeedback: eligible.map((f) => ({
      id: f.id,
      targetKind: f.targetKind,
      briefId: f.briefId,
      briefName: f.briefName,
      campaignId: f.campaignId,
      campaignLabel: f.campaignLabel,
      verdict: f.verdict,
      authorName: f.authorName,
      comment: f.comment,
    })),
  });

  const rawResult = await meteredCall(ctx, 'plan', null, () =>
    ctx.llm.generateJson({ system, user, schema: ProposedChangesListSchema, effort: 'medium' }),
  );

  const briefById = new Map(briefs.map((b) => [b.id, b]));
  const sanitized = rawResult.proposals.map((proposal) => sanitizeProposal(proposal, eligible, briefById, briefs[0]));
  const saved = await saveAdShareProposals({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    proposals: sanitized,
    actorId: ctx.actorId,
    now: ctx.now,
  });

  return {
    proposals: saved,
    analyzedFeedbackCount: eligible.length,
  };
}

export interface DecideClientProposalResult {
  proposal: AdShareProposalView;
  appliedBriefId: string | null;
  run: AdStudioRunModel | null;
}

async function syncFeedbackStatusesAfterProposalDecision(params: {
  organizationId: string;
  projectId: string;
  feedbackIds: readonly string[];
  targetStatus: 'applied' | 'declined';
  now: Date;
}): Promise<void> {
  if (params.feedbackIds.length === 0) return;
  const allProposals = await listAdShareProposals(params.organizationId, params.projectId);
  const unresolvedFeedback = new Set<string>();
  for (const prop of allProposals) {
    const blocks =
      params.targetStatus === 'applied'
        ? prop.status === 'pending'
        : prop.status === 'pending' || prop.status === 'approved' || prop.status === 'applied';
    if (blocks) {
      for (const fid of prop.feedbackIds) unresolvedFeedback.add(fid);
    }
  }
  const resolved = params.feedbackIds.filter((fid) => !unresolvedFeedback.has(fid));
  if (resolved.length > 0) {
    await updateAdShareFeedbackStatus({
      organizationId: params.organizationId,
      projectId: params.projectId,
      feedbackIds: resolved,
      status: params.targetStatus,
      now: params.now,
    });
  }
}

async function applyProposalChanges(params: {
  organizationId: string;
  projectId: string;
  actorId: string;
  kind: AdShareProposalKind;
  briefId: string | null;
  changes: AdShareProposalChanges;
  llm?: AdStudioLlm | null;
  now: Date;
}): Promise<{ briefId: string; needsVideo: boolean; needsImages: boolean; needsPlan: boolean }> {
  const { organizationId, projectId, actorId, kind, changes, llm, now } = params;

  if (kind === 'create_new_brief') {
    const created = await createAdStudioBrief({
      organizationId,
      projectId,
      input: {
        name: changes.name?.trim() || 'Client-requested ad',
        objective: changes.objective?.trim() || 'Drive qualified leads from paid ads',
        productDescription: changes.productDescription?.trim() || changes.objective?.trim() || 'Core offer',
        landingPageUrl: changes.landingPageUrl ?? null,
        format: isAdStudioFormat(changes.format) ? changes.format : 'vertical',
        language: changes.language?.trim() || 'he',
        targetSeconds: clampSeconds(changes.targetSeconds, 15),
      },
      createdByUserId: actorId,
      now,
    });
    if (changes.videoInstructions !== undefined) {
      await saveAdStudioVideoSettings({
        organizationId,
        projectId,
        briefId: created.id,
        settings: { instructions: changes.videoInstructions ?? '' },
        now,
      });
    }
    if (changes.voicePreset && isAdStudioVoicePreset(changes.voicePreset)) {
      await saveAdStudioVoice({
        organizationId,
        projectId,
        briefId: created.id,
        voice: { preset: changes.voicePreset },
        now,
      });
    }
    if (changes.scenes?.length) {
      const fitted = fitAdStudioScenes(
        changes.scenes.map((s) => ({ id: newAdStudioSceneId(), ...s })),
        newAdStudioSceneId,
      );
      if (fitted.length > 0) {
        await saveAdStudioScriptWithPronunciation({
          organizationId,
          projectId,
          briefId: created.id,
          scenes: fitted,
          actorId,
          llm: llm ?? null,
          now,
        });
      }
    }
    if (changes.concepts?.length) {
      const fitted = fitAdStudioImageConcepts(changes.concepts, newAdStudioSceneId);
      if (fitted.length > 0) {
        await saveAdStudioImageConcepts({ organizationId, projectId, briefId: created.id, concepts: fitted, now });
      }
    }
    return {
      briefId: created.id,
      needsVideo: true,
      needsImages: true,
      needsPlan: !changes.scenes?.length,
    };
  }

  if (!params.briefId) {
    throw new Error('Proposal has no target briefId.');
  }
  const brief = await getAdStudioBrief(organizationId, projectId, params.briefId);

  if (kind === 'update_brief_settings') {
    const base = adStudioBriefInput(brief);
    const hasBriefDetails =
      changes.name !== undefined ||
      changes.objective !== undefined ||
      changes.productDescription !== undefined ||
      changes.landingPageUrl !== undefined ||
      changes.format !== undefined ||
      changes.language !== undefined ||
      changes.targetSeconds !== undefined;

    if (hasBriefDetails) {
      await updateAdStudioBriefDetails({
        organizationId,
        projectId,
        briefId: brief.id,
        input: {
          ...base,
          ...(changes.name ? { name: changes.name } : {}),
          ...(changes.objective ? { objective: changes.objective } : {}),
          ...(changes.productDescription ? { productDescription: changes.productDescription } : {}),
          ...(changes.landingPageUrl !== undefined ? { landingPageUrl: changes.landingPageUrl } : {}),
          ...(isAdStudioFormat(changes.format) ? { format: changes.format } : {}),
          ...(changes.language ? { language: changes.language } : {}),
          ...(changes.targetSeconds !== undefined ? { targetSeconds: clampSeconds(changes.targetSeconds, base.targetSeconds) } : {}),
        },
        now,
      });
    }
    if (changes.videoInstructions !== undefined) {
      await saveAdStudioVideoSettings({
        organizationId,
        projectId,
        briefId: brief.id,
        settings: { instructions: changes.videoInstructions ?? '' },
        now,
      });
    }
    if (changes.voicePreset && isAdStudioVoicePreset(changes.voicePreset)) {
      await saveAdStudioVoice({
        organizationId,
        projectId,
        briefId: brief.id,
        voice: { preset: changes.voicePreset },
        now,
      });
    }
    if (changes.videoCopy) {
      await saveAdStudioCopy({
        organizationId,
        projectId,
        briefId: brief.id,
        videoCopy: changes.videoCopy,
        now,
      });
    }
    return {
      briefId: brief.id,
      needsVideo: brief.scenes.length > 0,
      needsImages: (brief.image_concepts ?? []).length > 0 && Boolean(changes.language || changes.format || changes.objective),
      needsPlan: false,
    };
  }

  if (kind === 'update_video_script') {
    const scenesInput = (changes.scenes ?? []).map((s, idx) => ({
      id: brief.scenes[idx]?.id ?? newAdStudioSceneId(),
      ...s,
    }));
    const fitted = fitAdStudioScenes(scenesInput, newAdStudioSceneId);
    if (fitted.length > 0) {
      await saveAdStudioScriptWithPronunciation({
        organizationId,
        projectId,
        briefId: brief.id,
        scenes: fitted,
        actorId,
        llm: llm ?? null,
        now,
      });
    }
    return { briefId: brief.id, needsVideo: true, needsImages: false, needsPlan: false };
  }

  if (kind === 'update_image_concepts') {
    const existing = [...(brief.image_concepts ?? [])];
    const fitted = fitAdStudioImageConcepts(changes.concepts ?? [], newAdStudioSceneId);
    let nextConcepts = existing;
    const mode = changes.mode ?? 'update_first';
    if (mode === 'replace_all') {
      nextConcepts = fitted;
    } else if (mode === 'append') {
      nextConcepts = [...existing, ...fitted].slice(0, AD_STUDIO_MAX_IMAGE_CONCEPTS);
    } else if (fitted.length > 0) {
      const updatedFirst = existing[0] ? { ...fitted[0], id: existing[0].id } : fitted[0];
      nextConcepts = [updatedFirst, ...existing.slice(1)];
    }
    await saveAdStudioImageConcepts({
      organizationId,
      projectId,
      briefId: brief.id,
      concepts: nextConcepts,
      now,
    });
    return { briefId: brief.id, needsVideo: false, needsImages: true, needsPlan: false };
  }

  if (kind === 'update_search_ad') {
    const existing = brief.search_ad;
    const merged = fitSearchAd({
      headlines: changes.headlines?.length ? changes.headlines : existing?.headlines ?? [],
      descriptions: changes.descriptions?.length ? changes.descriptions : existing?.descriptions ?? [],
      path1: changes.path1 ?? existing?.path1 ?? '',
      path2: changes.path2 ?? existing?.path2 ?? '',
    });
    await saveAdStudioSearchAd({
      organizationId,
      projectId,
      briefId: brief.id,
      ad: merged,
      now,
    });
    return { briefId: brief.id, needsVideo: false, needsImages: false, needsPlan: false };
  }

  return { briefId: brief.id, needsVideo: false, needsImages: false, needsPlan: false };
}

/**
 * Applies (`decision: 'approve'`) or rejects (`decision: 'decline'`) an AI proposal on behalf of
 * the marketing manager, updating the target brief and starting regeneration when media changed.
 */
export async function decideClientProposal(ctx: {
  organizationId: string;
  projectId: string;
  proposalId: string;
  actorId: string;
  decision: 'approve' | 'decline';
  regenerate?: boolean;
  llm?: AdStudioLlm | null;
  now?: Date;
}): Promise<DecideClientProposalResult> {
  await ensureOrm();
  const now = ctx.now ?? new Date();
  const proposal = await getAdShareProposal(ctx.organizationId, ctx.projectId, ctx.proposalId);

  if (ctx.decision === 'decline') {
    const declined = await updateAdShareProposalOutcome({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      proposalId: proposal.id,
      status: 'declined',
      actorId: ctx.actorId,
      now,
    });
    await syncFeedbackStatusesAfterProposalDecision({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      feedbackIds: proposal.feedback_ids ?? [],
      targetStatus: 'declined',
      now,
    });
    return { proposal: declined, appliedBriefId: null, run: null };
  }

  if (proposal.status === 'applied') {
    const view: AdShareProposalView = {
      id: proposal.id,
      feedbackIds: [...(proposal.feedback_ids ?? [])],
      clientQuote: proposal.client_quote,
      kind: proposal.kind,
      briefId: proposal.brief_id ?? null,
      briefName: proposal.brief_name ?? null,
      title: proposal.title,
      summary: proposal.summary,
      rationale: proposal.rationale,
      changes: proposal.changes ?? {},
      status: proposal.status,
      appliedBriefId: proposal.applied_brief_id ?? null,
      runId: proposal.run_id ?? null,
      failureReason: proposal.failure_reason ?? null,
      createdOn: proposal.created_on,
      decidedOn: proposal.decided_on ?? null,
    };
    return { proposal: view, appliedBriefId: proposal.applied_brief_id ?? proposal.brief_id ?? null, run: null };
  }

  try {
    const applied = await applyProposalChanges({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      kind: proposal.kind,
      briefId: proposal.brief_id ?? null,
      changes: proposal.changes ?? {},
      llm: ctx.llm ?? null,
      now,
    });

    let run: AdStudioRunModel | null = null;
    if (ctx.regenerate !== false && (applied.needsPlan || applied.needsImages || applied.needsVideo)) {
      run = await startAdStudioAutopilot({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        briefId: applied.briefId,
        actorId: ctx.actorId,
        options: {
          plan: applied.needsPlan,
          images: applied.needsImages,
          video: applied.needsVideo,
          confirmPlan: false,
        },
      });
    }

    const updated = await updateAdShareProposalOutcome({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      proposalId: proposal.id,
      status: 'applied',
      appliedBriefId: applied.briefId,
      runId: run ? run.id : null,
      failureReason: null,
      actorId: ctx.actorId,
      now,
    });

    await syncFeedbackStatusesAfterProposalDecision({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      feedbackIds: proposal.feedback_ids ?? [],
      targetStatus: 'applied',
      now,
    });

    return { proposal: updated, appliedBriefId: applied.briefId, run };
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400);
    const failed = await updateAdShareProposalOutcome({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      proposalId: proposal.id,
      status: 'failed',
      failureReason: reason,
      actorId: ctx.actorId,
      now,
    });
    throw Object.assign(error instanceof Error ? error : new Error(reason), { proposal: failed });
  }
}
