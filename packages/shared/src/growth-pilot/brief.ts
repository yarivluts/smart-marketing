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
  // Only the site's own words (the analysis is in the site's language) and punctuation: the person
  // sees these on the ad, so no English glue around Hebrew text.
  const parts = (...values: string[]) => values.map((value) => value.trim()).filter(Boolean);
  const objective =
    target.kind === 'audience'
      ? parts(`${target.name} (${business})`, target.description, target.audience).join(' - ')
      : parts(`${target.name} (${business})`, target.audience, target.description).join(' - ');
  const productDescription = [
    `${business}: ${analysis.summary}`,
    `${target.name}: ${target.description}`,
    target.audience,
    analysis.offerings.map((offering) => `${offering.name} - ${offering.description}`).join('; '),
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
