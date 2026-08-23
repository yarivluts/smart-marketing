import type { CancellationReasonCodeCount, CancellationReasonThemeCluster } from './types';

/**
 * A fixed keyword taxonomy of common SaaS churn-reason themes — a
 * buildable-today, deterministic stand-in for a real LLM-based clustering
 * call (same posture `clusterFeedbackThemes`/KAN-82 established: inspectable,
 * no external API dependency, good enough to surface "what customers who
 * pick 'other' (or add a free-text comment at all) are actually saying"
 * without waiting on a real model integration). Each comment is assigned to
 * at most one theme — whichever has the most keyword hits — so a comment
 * mentioning both "expensive" and "a competitor" picks the stronger signal
 * rather than double-counting.
 */
const THEME_KEYWORDS: ReadonlyArray<{ readonly theme: string; readonly keywords: readonly string[] }> = [
  { theme: 'pricing', keywords: ['price', 'pricing', 'expensive', 'cost', 'costly', 'afford', 'affordable', 'cheap', 'budget'] },
  { theme: 'competitor', keywords: ['competitor', 'alternative', 'switched', 'switching', 'moved', 'another'] },
  { theme: 'missing_features', keywords: ['feature', 'features', 'missing', 'need', 'needs', 'wish', 'lacking', 'integration', 'integrations'] },
  { theme: 'support', keywords: ['support', 'response', 'respond', 'help', 'ticket', 'agent', 'service', 'unresponsive'] },
  { theme: 'bugs', keywords: ['bug', 'bugs', 'crash', 'crashes', 'crashing', 'error', 'errors', 'broken', 'unreliable', 'glitch', 'glitchy'] },
  { theme: 'not_using', keywords: ['unused', 'closed', 'paused', 'seasonal', 'downsized', 'shut', 'inactive'] },
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0),
  );
}

export interface ClusterCancellationReasonCommentsOptions {
  /** Example comments kept per theme, most-recent-first per the input order. Default 3. */
  readonly maxExamplesPerTheme?: number;
}

/**
 * Groups free-text cancellation comments into a small set of named themes,
 * most common first — the churn-reason counterpart of `clusterFeedbackThemes`.
 * Comments that don't match any theme's keyword lexicon are dropped from the
 * digest (not forced into a catch-all bucket), same reasoning as that
 * function's own doc comment. `comments` should already be scoped to
 * whatever window/reason-code slice the caller wants clustered — this
 * function itself has no notion of time or structured reason code.
 */
export function clusterCancellationReasonComments(
  comments: readonly string[],
  options?: ClusterCancellationReasonCommentsOptions,
): CancellationReasonThemeCluster[] {
  const maxExamples = options?.maxExamplesPerTheme ?? 3;
  const commentsByTheme = new Map<string, string[]>();

  for (const comment of comments) {
    const tokens = tokenize(comment);
    let bestTheme: string | null = null;
    let bestHits = 0;
    for (const { theme, keywords } of THEME_KEYWORDS) {
      const hits = keywords.filter((keyword) => tokens.has(keyword)).length;
      if (hits > bestHits) {
        bestHits = hits;
        bestTheme = theme;
      }
    }
    if (bestTheme === null) continue;
    const existing = commentsByTheme.get(bestTheme) ?? [];
    existing.push(comment);
    commentsByTheme.set(bestTheme, existing);
  }

  return Array.from(commentsByTheme.entries())
    .map(([theme, matchedComments]) => ({
      theme,
      commentCount: matchedComments.length,
      exampleComments: matchedComments.slice(0, maxExamples),
    }))
    .sort((a, b) => b.commentCount - a.commentCount || a.theme.localeCompare(b.theme));
}

/**
 * Pure aggregation over a flat list of structured `reason_code` values —
 * the "live taxonomy" breakdown half of the AC, no I/O, callers own
 * fetching/filtering the raw responses (same posture `computeNpsBreakdown`
 * establishes for its own pure aggregation). Most-common reason first, ties
 * broken alphabetically for a deterministic order.
 */
export function computeCancellationReasonCodeBreakdown(reasonCodes: readonly string[]): CancellationReasonCodeCount[] {
  const counts = new Map<string, number>();
  for (const reasonCode of reasonCodes) {
    counts.set(reasonCode, (counts.get(reasonCode) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reasonCode, count]) => ({ reasonCode, count }))
    .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode));
}
