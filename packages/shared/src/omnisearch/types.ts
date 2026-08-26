/**
 * The result "kinds" a project's global omnisearch index can contain (KAN-85).
 * Deliberately scoped to entities that already have a project-scoped
 * "list everything" query and a stable browse destination: boards (E11.2),
 * active metric definitions (E5.1), segments (E14.x — the closest existing
 * stand-in for "customers", since there's no first-class individual-customer
 * index yet), automation campaign targets (E21.1), and goals (E12.1). A real
 * per-customer index is a documented follow-up, not built here.
 */
export const OMNI_SEARCH_RESULT_TYPES = ['board', 'metric', 'segment', 'campaign', 'goal'] as const;

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
