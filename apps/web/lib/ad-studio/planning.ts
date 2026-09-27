import 'server-only';
import { z } from 'zod/v4';
import { AD_STUDIO_CITATION_SOURCES, availableEvidenceSources, buildPlanPrompt, sanitizeAdStudioPlan, toAdStudioPlanSources } from '@growthos/shared';
import { adStudioBriefInput, assertAdStudioQuota, getAdStudioBrief, saveAdStudioPlan, type AdStudioBriefModel } from '@growthos/firebase-orm-models';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { meteredCall, type AdStudioCallContext } from './metering';
import { gatherAdStudioEvidence, type PlanningSourceDeps } from './planning-sources';

const CitationSchema = z.object({
  source: z.enum(AD_STUDIO_CITATION_SOURCES).describe('The evidence this rests on; market for general knowledge that is not in the evidence.'),
  detail: z.string().describe('Which fact from that source, quoted or named exactly.'),
});

export const AdStudioPlanSchema = z.object({
  summary: z.string().describe('Two or three sentences: what the ad should do and why, in the ad language.'),
  audience: z.string().describe('Who the ad speaks to, in the ad language.'),
  landingPageSummary: z.string().describe('What the landing page says, in brief; empty if the landing page is unavailable.'),
  messagingAngles: z.array(z.string()).describe('Distinct angles the ad can take, in the ad language.'),
  keywordThemes: z.array(
    z.object({
      theme: z.string(),
      keywords: z.array(z.string()).describe('Search terms, exactly as they appear in the keyword evidence.'),
      evidence: z.string().describe('Where this theme comes from.'),
    }),
  ),
  recommendations: z.array(
    z.object({
      title: z.string(),
      rationale: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
      evidence: z.array(CitationSchema),
    }),
  ),
  marketNotes: z.array(z.string()).describe('General market knowledge used above - not measured data.'),
});

/**
 * Deep analysis for one brief (KAN-230): gathers the evidence (landing page, measured results,
 * campaigns, keyword volumes), asks the text model for a plan in one metered call (usage kind
 * `plan`), holds the plan to the evidence it had, and stores both on the brief. The daily limit is
 * checked before gathering too, so a spent limit costs no warehouse query or Google Ads call.
 */
export async function planAdStudioBrief(
  ctx: AdStudioCallContext & { briefId: string; environment: { id: string; name: string } | null; deps?: PlanningSourceDeps },
): Promise<AdStudioBriefModel> {
  await ensureFirestoreOrm();
  const brief = await getAdStudioBrief(ctx.organizationId, ctx.projectId, ctx.briefId);
  await assertAdStudioQuota({ organizationId: ctx.organizationId, projectId: ctx.projectId, kind: 'plan', units: 1, now: ctx.now });
  const input = adStudioBriefInput(brief);
  const evidence = await gatherAdStudioEvidence({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    brief: input,
    environment: ctx.environment,
    deps: { now: ctx.now, ...ctx.deps },
  });
  const prompt = buildPlanPrompt(input, evidence);
  const generated = await meteredCall(ctx, 'plan', brief.id, () => ctx.llm.generateJson({ ...prompt, schema: AdStudioPlanSchema }));
  const { plan } = sanitizeAdStudioPlan(generated, availableEvidenceSources(evidence));
  return saveAdStudioPlan({
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    briefId: brief.id,
    plan,
    sources: toAdStudioPlanSources(evidence),
    generatedBy: { provider: ctx.llm.provider, model: ctx.llm.model, generated_at: (ctx.now ?? new Date()).toISOString() },
    now: ctx.now,
  });
}
