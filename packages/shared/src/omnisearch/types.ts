/**
 * The result "kinds" a project's global omnisearch index can contain (KAN-85).
 * Deliberately scoped to entities that already have a project-scoped
 * "list everything" query and a stable browse destination: boards (E11.2),
 * active metric definitions (E5.1), segments (E14.x), automation campaign
 * targets (E21.1), goals (E12.1), and win rules (E12.2, KAN-106 — satisfied
 * the same inclusion criterion as goals but was never added when this index
 * was first built). `customer` (KAN-116) is the one exception to "list
 * everything eagerly and rank client-side": there is no bounded "list every
 * customer" query to prefetch, so a `customer` result is only ever produced
 * query-time, by running the KAN-108 Customer 360 substring search live as
 * the palette's own query changes — see `apps/web/lib/orgs/omnisearch.ts`'s
 * `buildOmniSearchCustomerItems`. `page` is the odd one out: not a listed
 * entity at all, but a static "jump to this page" shortcut for every
 * permission-gated nav destination `ProjectLayout` renders — see
 * `buildOmniSearchPageShortcuts` in the same file.
 */
export const OMNI_SEARCH_RESULT_TYPES = ['board', 'metric', 'segment', 'campaign', 'goal', 'win_rule', 'customer', 'page'] as const;

export type OmniSearchResultType = (typeof OMNI_SEARCH_RESULT_TYPES)[number];

/** One searchable, navigable entity in a project's omnisearch index. */
export interface OmniSearchItem {
  id: string;
  type: OmniSearchResultType;
  label: string;
  description?: string;
  /** Project-relative-and-below path (no locale prefix), e.g. `/orgs/o1/projects/p1/boards/b1`. */
  href: string;
}
