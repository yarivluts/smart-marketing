import type { OmniSearchItem } from './types';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

interface ScoredItem {
  item: OmniSearchItem;
  score: number;
  matchIndex: number;
}

/**
 * Ranks a project's omnisearch index against a free-text query — a
 * deterministic label/description-matching heuristic (same "buildable-today
 * stand-in for something fancier" posture as `segment-suggestion` and
 * `churn-reason`'s clustering: this is a search-ranking function, not a
 * search *service*, so no inverted index or fuzzy edit-distance matching).
 *
 * Ranked highest to lowest: exact label match, label starts with the query,
 * label contains the query (earlier match position ranks higher), then a
 * description-only match. Items matching only on description rank below
 * every label match regardless of position. Ties break alphabetically by
 * label for stable, predictable ordering across renders.
 *
 * An empty (or whitespace-only) query returns no results — omnisearch is a
 * "jump to X" tool, not a browse-everything list; a caller wanting a default
 * view should show its own recents/empty state instead.
 */
export function searchOmniSearchItems(
  items: readonly OmniSearchItem[],
  query: string,
  limit = 8,
): OmniSearchItem[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [];
  }

  const scored: ScoredItem[] = [];
  for (const item of items) {
    const label = normalize(item.label);
    const labelMatchIndex = label.indexOf(normalizedQuery);

    let score: number;
    let matchIndex: number;
    if (label === normalizedQuery) {
      score = 100;
      matchIndex = 0;
    } else if (label.startsWith(normalizedQuery)) {
      score = 80;
      matchIndex = 0;
    } else if (labelMatchIndex >= 0) {
      score = 60;
      matchIndex = labelMatchIndex;
    } else if (item.description && normalize(item.description).includes(normalizedQuery)) {
      score = 20;
      matchIndex = Number.MAX_SAFE_INTEGER;
    } else {
      continue;
    }

    scored.push({ item, score, matchIndex });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.matchIndex !== b.matchIndex) {
      return a.matchIndex - b.matchIndex;
    }
    return a.item.label.localeCompare(b.item.label);
  });

  return scored.slice(0, limit).map((entry) => entry.item);
}
