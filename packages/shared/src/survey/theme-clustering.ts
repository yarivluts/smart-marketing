import type { FeedbackThemeCluster } from './types';

/**
 * A fixed keyword taxonomy of common SaaS feedback themes — a buildable-
 * today, deterministic stand-in for a real LLM-based theme-clustering call
 * (same posture `suggestFieldMappingRules`/KAN-55 established: inspectable,
 * no external API dependency, good enough to surface a "top complaint this
 * month" digest without waiting on a real model integration). Each comment
 * is assigned to at most one theme — whichever has the most keyword hits —
 * so a comment mentioning both "expensive" and "slow" picks the stronger
 * signal rather than double-counting.
 */
const THEME_KEYWORDS: ReadonlyArray<{ readonly theme: string; readonly keywords: readonly string[] }> = [
  { theme: 'pricing', keywords: ['price', 'pricing', 'expensive', 'cost', 'costly', 'billing', 'afford', 'affordable', 'cheap', 'subscription'] },
  { theme: 'support', keywords: ['support', 'response', 'respond', 'help', 'ticket', 'agent', 'service', 'unresponsive'] },
  { theme: 'bugs', keywords: ['bug', 'bugs', 'crash', 'crashes', 'crashing', 'error', 'errors', 'broken', 'glitch', 'glitchy'] },
  { theme: 'performance', keywords: ['slow', 'lag', 'laggy', 'sluggish', 'timeout', 'timeouts', 'loading', 'freezes', 'freezing'] },
  { theme: 'missing_features', keywords: ['feature', 'features', 'missing', 'need', 'needs', 'wish', 'lacking', 'integration', 'integrations'] },
  { theme: 'onboarding', keywords: ['onboarding', 'setup', 'confusing', 'confused', 'learn', 'tutorial', 'documentation', 'docs'] },
  { theme: 'usability', keywords: ['ui', 'ux', 'interface', 'design', 'navigate', 'navigation', 'intuitive', 'clunky'] },
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0),
  );
}

export interface ClusterFeedbackThemesOptions {
  /** Example comments kept per theme, most-recent-first per the input order. Default 3. */
  readonly maxExamplesPerTheme?: number;
}

/**
 * Groups free-text feedback comments into a small set of named themes, most
 * common first — the "top complaint this month" digest. Comments that don't
 * match any theme's keyword lexicon are dropped from the digest (not forced
 * into a catch-all bucket): a low-signal comment shouldn't dilute a real
 * theme's ranking. `comments` should already be scoped to whatever window
 * the caller wants clustered (e.g. this month's landed responses) — this
 * function itself has no notion of time.
 */
export function clusterFeedbackThemes(
  comments: readonly string[],
  options?: ClusterFeedbackThemesOptions,
): FeedbackThemeCluster[] {
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
