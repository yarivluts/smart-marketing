import type { AdStudioBriefInput } from '../ad-studio/prompts';
import type { GrowthSiteAnalysis, GrowthTargetKind } from './analysis';

/**
 * An approved target becomes an Ad Studio brief: the ads are written in the site's language, for
 * the target's audience, sending people to the site. Built from what the person approved - no
 * model call - so the brief says exactly what they agreed to.
 */

export interface GrowthBriefTarget {
  kind: GrowthTargetKind;
  name: string;
  description: string;
  audience: string;
}

/** Short video by default: the pilot starts with image ads and a search ad; video is the person's call. */
export const GROWTH_BRIEF_SECONDS = 15;

function cap(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function growthBriefInput(params: { analysis: GrowthSiteAnalysis; target: GrowthBriefTarget; siteUrl: string }): AdStudioBriefInput {
  const { analysis, target } = params;
  const business = analysis.businessName || target.name;
  const objective =
    target.kind === 'audience'
      ? `Reach ${target.name} and bring them to ${business}. ${target.description} ${target.audience}`
      : `Bring ${target.audience || 'the right customers'} to try ${target.name} by ${business}. ${target.description}`;
  const productDescription = [
    `${business}: ${analysis.summary}`,
    `${target.name}: ${target.description}`,
    target.audience ? `For: ${target.audience}` : '',
    analysis.offerings.length ? `Offerings: ${analysis.offerings.map((offering) => `${offering.name} - ${offering.description}`).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    name: cap(target.name, 120),
    objective: cap(objective, 2000),
    productDescription: cap(productDescription, 4000),
    landingPageUrl: params.siteUrl,
    format: 'vertical',
    language: analysis.language || 'en',
    targetSeconds: GROWTH_BRIEF_SECONDS,
  };
}
