import type { SegmentSuggestion, SegmentSuggestionCategory, SegmentSuggestionSourceField } from './types';

/** One work-list concept's own keyword lexicon — see `types.ts`'s doc comment on {@link SegmentSuggestionCategory} for why this vocabulary is closed. Every keyword is pre-normalized (lowercase, no separators) since it's matched against both a tokenized and a fully-normalized form of the field name — see {@link matchCategory}, the same two-pass technique `funnel-suggestion/suggest.ts`'s `matchStage` already established for its own keyword heuristic. */
interface CategoryTemplate {
  category: SegmentSuggestionCategory;
  keywords: readonly string[];
}

const CATEGORY_TEMPLATES: readonly CategoryTemplate[] = [
  { category: 'churn_risk', keywords: ['churn', 'churned', 'cancel', 'canceled', 'cancelled', 'cancelling', 'cancellation'] },
  { category: 'payment_risk', keywords: ['delinquent', 'pastdue', 'overdue', 'declined', 'dunning', 'failed'] },
  { category: 'trial', keywords: ['trial', 'trialing'] },
  { category: 'vip', keywords: ['vip', 'highvalue', 'champion', 'priority'] },
];

function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** A short keyword is allowed to match a whole token exactly, but not as a bare substring of the field's normalized name — mirrors `funnel-suggestion/suggest.ts`'s identical guard against, e.g., a keyword like `"vip"` spuriously matching inside an unrelated longer word. Only keywords at least this long are eligible for the looser substring check. */
const MIN_SUBSTRING_KEYWORD_LENGTH = 6;

/**
 * Scores every {@link CATEGORY_TEMPLATES} entry against one field name and returns the best match, or
 * `null` if nothing clears any signal at all — unlike `funnel-suggestion`'s `matchStage` (which always
 * falls back to an `other` bucket, since every event needs a funnel slot), a segment suggestion with no
 * confident match is simply dropped: proposing a wrong guess is worse than proposing nothing, the same
 * posture `suggestFieldMappingRules` (KAN-55) already established for its own proposer.
 */
function matchCategory(fieldName: string): { category: SegmentSuggestionCategory; confidence: number } | null {
  const tokens = new Set(tokenize(fieldName));
  const normalized = normalize(fieldName);

  let best: { category: SegmentSuggestionCategory; confidence: number } | null = null;
  for (const template of CATEGORY_TEMPLATES) {
    let score = 0;
    for (const keyword of template.keywords) {
      if (tokens.has(keyword)) {
        score = Math.max(score, 1);
      } else if (keyword.length >= MIN_SUBSTRING_KEYWORD_LENGTH && normalized.includes(keyword)) {
        score = Math.max(score, 0.7);
      }
    }
    if (score > 0 && (!best || score > best.confidence)) {
      best = { category: template.category, confidence: score };
    }
  }

  return best;
}

/**
 * Proposes a high-value work list for each boolean field on one registered entity schema whose name
 * reads as a recognized signal (KAN-81 AC: "AI proposes new high-value lists"). A deterministic
 * keyword heuristic — a buildable-today stand-in for a real LLM call, the same "provider-agnostic, real
 * backend deferred" posture `suggestFieldMappingRules` (KAN-55) and `proposeFunnelSteps` (KAN-68)
 * already established for their own proposers.
 *
 * Deliberately scoped to boolean fields only: a saved segment's filter model (`SegmentFilterCondition`)
 * can express a confident `field = true` signal without guessing at any data-dependent threshold or
 * enum value, but has no way to safely infer, say, a "renewing in 30 days" date-range or a "falling
 * usage" trend from a field's name alone — proposing either would be exactly the "wrong guess" this
 * heuristic is built to avoid. Non-boolean fields (numeric MRR, string plan tiers, timestamps) are
 * left for a future, richer proposer.
 *
 * Every boolean field is scored independently and kept only if its top-scoring category clears
 * `minConfidence` — two different fields can both propose the same category (e.g. `is_canceled` and
 * `cancel_at_period_end` both reading as `churn_risk`), since each is a distinct, independently useful
 * list. Result is sorted by confidence descending, ties broken alphabetically by field name.
 */
export function proposeSegmentSuggestions(
  schemaName: string,
  fields: readonly SegmentSuggestionSourceField[],
  minConfidence = 0.6,
): SegmentSuggestion[] {
  const suggestions: SegmentSuggestion[] = [];

  for (const field of fields) {
    if (field.type !== 'boolean') {
      continue;
    }
    const match = matchCategory(field.name);
    if (!match || match.confidence < minConfidence) {
      continue;
    }
    suggestions.push({
      schemaName,
      field: field.name,
      category: match.category,
      filters: [{ field: field.name, op: '=', value: true }],
      confidence: match.confidence,
    });
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence || a.field.localeCompare(b.field));
}
