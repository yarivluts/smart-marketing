import type { IndustryCategory } from './taxonomy';

/**
 * A fixed keyword + domain-TLD taxonomy — a buildable-today, deterministic
 * stand-in for a real AI/LLM industry-classification call (same posture
 * `clusterFeedbackThemes`/KAN-82 and `clusterCancellationReasonComments`/
 * KAN-84 established for their own free-text clustering: inspectable, no
 * external API dependency, good enough to seed composition dashboards
 * without waiting on a real model integration). Checked in order — company
 * name keywords first (the stronger, more specific signal), then the
 * domain's own TLD as a fallback for a name that matched nothing.
 */
const NAME_KEYWORDS: ReadonlyArray<{ readonly industry: IndustryCategory; readonly keywords: readonly string[] }> = [
  { industry: 'healthcare', keywords: ['health', 'clinic', 'medical', 'pharma', 'hospital', 'care', 'wellness', 'bio'] },
  { industry: 'finance_fintech', keywords: ['bank', 'capital', 'financial', 'finance', 'invest', 'fund', 'insurance', 'payments', 'fintech'] },
  { industry: 'ecommerce_retail', keywords: ['shop', 'store', 'retail', 'market', 'commerce', 'goods', 'mall'] },
  { industry: 'education', keywords: ['school', 'academy', 'university', 'college', 'edu', 'learning', 'tutor'] },
  { industry: 'manufacturing', keywords: ['manufacturing', 'factory', 'industrial', 'fabrication', 'materials', 'parts'] },
  { industry: 'media_entertainment', keywords: ['media', 'studio', 'games', 'entertainment', 'films', 'music', 'press'] },
  { industry: 'nonprofit', keywords: ['foundation', 'nonprofit', 'charity', 'ngo', 'trust'] },
  { industry: 'professional_services', keywords: ['consulting', 'advisors', 'law', 'legal', 'accounting', 'agency', 'partners'] },
  { industry: 'saas_software', keywords: ['software', 'tech', 'labs', 'systems', 'app', 'cloud', 'digital', 'ai', 'data'] },
];

const TLD_HINTS: ReadonlyArray<{ readonly suffix: string; readonly industry: IndustryCategory }> = [
  { suffix: '.edu', industry: 'education' },
  { suffix: '.health', industry: 'healthcare' },
  { suffix: '.shop', industry: 'ecommerce_retail' },
  { suffix: '.org', industry: 'nonprofit' },
  { suffix: '.io', industry: 'saas_software' },
  { suffix: '.ai', industry: 'saas_software' },
  { suffix: '.tech', industry: 'saas_software' },
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0),
  );
}

/**
 * Classifies a company into one of {@link INDUSTRY_CATEGORIES} from its
 * self-reported name and (optional) domain — KAN-87's "AI industry
 * classification" AC, this story's buildable-today deterministic stand-in.
 * Whichever name-keyword bucket has the most hits wins (ties broken by
 * {@link INDUSTRY_CATEGORIES}'s own declared order, deterministically); a
 * domain TLD hint is only consulted when the name matched nothing, since a
 * generic `.com` domain carries no signal at all. Returns `'other'` when
 * neither source matches — never throws, same "malformed/sparse input
 * degrades to the catch-all bucket" posture the rest of this codebase's own
 * classification/clustering functions take.
 */
export function classifyCompanyIndustry(companyName: string, companyDomain?: string): IndustryCategory {
  const nameTokens = tokenize(companyName);
  let bestIndustry: IndustryCategory | null = null;
  let bestHits = 0;
  for (const { industry, keywords } of NAME_KEYWORDS) {
    const hits = keywords.filter((keyword) => nameTokens.has(keyword)).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestIndustry = industry;
    }
  }
  if (bestIndustry !== null) {
    return bestIndustry;
  }

  const domain = companyDomain?.toLowerCase().trim();
  if (domain) {
    for (const { suffix, industry } of TLD_HINTS) {
      if (domain.endsWith(suffix)) {
        return industry;
      }
    }
  }

  return 'other';
}
