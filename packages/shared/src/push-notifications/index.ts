/**
 * Browser push notifications: which updates a person can be told about, and how each product event
 * maps onto one of the categories they switch on and off in their settings. Pure data, so the
 * sender (server), the settings page (browser) and the tests all read the same list.
 */

/** The groups a person turns on or off; each product event belongs to at most one of them. */
export const PUSH_CATEGORIES = ['approvals', 'ready', 'publishing', 'failures'] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export function isPushCategory(value: unknown): value is PushCategory {
  return typeof value === 'string' && (PUSH_CATEGORIES as readonly string[]).includes(value);
}

/** Where an update came from: the Growth Pilot feed, or an Ad Studio autopilot run. */
export const PUSH_EVENT_SOURCES = ['growth_pilot', 'ad_studio'] as const;
export type PushEventSource = (typeof PUSH_EVENT_SOURCES)[number];

/**
 * The events that send a push, by source. Anything not listed (a site read, a pause, a person's own
 * approve or reject, ads starting to build) stays in the in-app feed only.
 */
const CATEGORY_BY_EVENT: Record<PushEventSource, Readonly<Record<string, PushCategory>>> = {
  growth_pilot: {
    targets_proposed: 'approvals',
    proposal_revised: 'approvals',
    landing_ready: 'approvals',
    audience_ready: 'approvals',
    ads_ready: 'ready',
    video_ready: 'ready',
    ads_published: 'publishing',
    landing_published: 'publishing',
    ads_activated: 'publishing',
    budget_changed: 'publishing',
    audience_applied: 'publishing',
    analysis_failed: 'failures',
    revision_failed: 'failures',
    ads_failed: 'failures',
    video_failed: 'failures',
    landing_failed: 'failures',
    audience_failed: 'failures',
    publish_failed: 'failures',
    budget_change_failed: 'failures',
    audience_apply_failed: 'failures',
  },
  ad_studio: {
    run_awaiting_approval: 'approvals',
    run_done: 'ready',
    run_failed: 'failures',
  },
};

/** The category an event belongs to, or null when it does not send a push. */
export function pushCategoryForEvent(source: PushEventSource, kind: string): PushCategory | null {
  return CATEGORY_BY_EVENT[source]?.[kind] ?? null;
}

/** Every event kind that sends a push for a source (for completeness tests on the wording). */
export function pushEventKinds(source: PushEventSource): string[] {
  return Object.keys(CATEGORY_BY_EVENT[source]);
}

/** A person's notification choices. Everything is on until they turn something off. */
export interface PushPreferences {
  enabled: boolean;
  categories: Record<PushCategory, boolean>;
}

export function defaultPushPreferences(): PushPreferences {
  return { enabled: true, categories: { approvals: true, ready: true, publishing: true, failures: true } };
}

/** Fills any gap in a stored (possibly older, partial) preferences record with the defaults. */
export function normalizePushPreferences(input: Partial<{ enabled: unknown; categories: unknown }> | null | undefined): PushPreferences {
  const defaults = defaultPushPreferences();
  const categories = { ...defaults.categories };
  const stored = input?.categories;
  if (stored && typeof stored === 'object') {
    for (const category of PUSH_CATEGORIES) {
      const value = (stored as Record<string, unknown>)[category];
      if (typeof value === 'boolean') categories[category] = value;
    }
  }
  return { enabled: typeof input?.enabled === 'boolean' ? input.enabled : defaults.enabled, categories };
}

/** Whether a person with these choices gets a push of this category. */
export function pushAllowed(preferences: PushPreferences, category: PushCategory): boolean {
  return preferences.enabled && preferences.categories[category] === true;
}

/** What the service worker receives and shows. Kept small: push services cap a payload at 4 KB. */
export interface PushPayload {
  title: string;
  body: string;
  /** Same-origin path the notification opens, e.g. `/en/orgs/o/projects/p/growth-pilot`. */
  url: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag?: string;
}

/** Only same-origin absolute paths may be opened from a notification. */
export function isSafePushUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\');
}
