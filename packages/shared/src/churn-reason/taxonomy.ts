import { CHURN_REASON_CATEGORIES, isChurnReasonCategory, type ChurnReasonCategory, type ChurnReasonThemeCluster } from './types';

/**
 * A fixed keyword taxonomy for the six non-`other` churn categories — a
 * buildable-today, deterministic stand-in for a real LLM-based
 * theme-clustering call (same posture `clusterFeedbackThemes`/KAN-82 and
 * `suggestFieldMappingRules`/KAN-55 established: inspectable, no external
 * API dependency). Only consulted for an entry whose own structured
 * `category` is `other` or not a recognized category at all — a confident
 * structured category is never second-guessed by keyword matching.
 */
const THEME_KEYWORDS: ReadonlyArray<{ readonly theme: Exclude<ChurnReasonCategory, 'other'>; readonly keywords: readonly string[] }> = [
  { theme: 'too_expensive', keywords: ['price', 'pricing', 'expensive', 'cost', 'costly', 'afford', 'affordable', 'budget', 'cheaper'] },
  { theme: 'missing_features', keywords: ['feature', 'features', 'missing', 'need', 'needs', 'lacking', 'integration', 'integrations'] },
  { theme: 'switched_competitor', keywords: ['competitor', 'switched', 'switching', 'alternative', 'another tool', 'moved to'] },
  { theme: 'poor_support', keywords: ['support', 'service', 'response', 'unresponsive', 'ticket', 'help'] },
  { theme: 'too_complex', keywords: ['complex', 'complicated', 'difficult', 'confusing', 'hard to use', 'clunky'] },
  { theme: 'low_usage', keywords: ['unused', 'rarely', 'barely', 'inactive', "don't use", 'not using'] },
  { theme: 'no_longer_needed', keywords: ['no longer need', 'shut down', 'closed', 'closing', 'business ended', 'downsized'] },
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0),
  );
}

/** A single-word keyword matches a tokenized word exactly; a multi-word keyword (e.g. `'shut down'`) matches as a plain substring of the lowercased text instead, since {@link tokenize} would otherwise split it into words that could never re-match as one entry. */
function countKeywordHits(text: string, keywords: readonly string[]): number {
  const tokens = tokenize(text);
  const lowerText = text.toLowerCase();
  return keywords.filter((keyword) => (keyword.includes(' ') ? lowerText.includes(keyword) : tokens.has(keyword))).length;
}

/**
 * Resolves one landed churn reason to a taxonomy theme. A recognized,
 * non-`other` `category` wins outright (the structured signal is trusted).
 * Otherwise, `reasonText` is keyword-matched against {@link THEME_KEYWORDS};
 * a genuine tie or no match at all falls back to `other` — a churn-reason
 * breakdown must account for every landed reason, so (unlike
 * `clusterFeedbackThemes`, which drops a no-match comment from its digest
 * entirely) this never discards an entry.
 */
export function resolveChurnReasonTheme(category: string, reasonText?: string): ChurnReasonCategory {
  if (isChurnReasonCategory(category) && category !== 'other') {
    return category;
  }

  if (!reasonText) return 'other';

  let bestTheme: ChurnReasonCategory = 'other';
  let bestHits = 0;
  for (const { theme, keywords } of THEME_KEYWORDS) {
    const hits = countKeywordHits(reasonText, keywords);
    if (hits > bestHits) {
      bestHits = hits;
      bestTheme = theme;
    }
  }
  return bestTheme;
}

export interface ClusterChurnReasonsOptions {
  /** Example free-text reasons kept per theme, in input order. Default 3. */
  readonly maxExamplesPerTheme?: number;
}

export interface ChurnReasonEntry {
  readonly category: string;
  readonly reasonText?: string;
}

/**
 * Groups landed churn reasons into the fixed {@link CHURN_REASON_CATEGORIES}
 * taxonomy, most common first — the "live taxonomy" breakdown the gap doc
 * calls for, blending each entry's own structured category with an
 * AI-clustered fallback for anything left generic (see
 * {@link resolveChurnReasonTheme}). Every entry counts toward exactly one
 * theme, so `reasonCount` totals always equal `entries.length` — no entry is
 * ever dropped, unlike `clusterFeedbackThemes`'s own digest.
 */
export function clusterChurnReasons(
  entries: readonly ChurnReasonEntry[],
  options?: ClusterChurnReasonsOptions,
): ChurnReasonThemeCluster[] {
  const maxExamples = options?.maxExamplesPerTheme ?? 3;
  const counts = new Map<ChurnReasonCategory, number>();
  const examples = new Map<ChurnReasonCategory, string[]>();

  for (const entry of entries) {
    const theme = resolveChurnReasonTheme(entry.category, entry.reasonText);
    counts.set(theme, (counts.get(theme) ?? 0) + 1);
    if (entry.reasonText) {
      const existing = examples.get(theme) ?? [];
      if (existing.length < maxExamples) {
        existing.push(entry.reasonText);
      }
      examples.set(theme, existing);
    }
  }

  return CHURN_REASON_CATEGORIES.filter((theme) => counts.has(theme))
    .map((theme) => ({
      theme,
      reasonCount: counts.get(theme) ?? 0,
      exampleReasons: examples.get(theme) ?? [],
    }))
    .sort((a, b) => b.reasonCount - a.reasonCount || a.theme.localeCompare(b.theme));
}
