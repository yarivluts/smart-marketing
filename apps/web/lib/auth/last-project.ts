/**
 * The project a person last opened, remembered in a cookie so signing in takes them straight back to
 * it instead of to an overview. Only ids are stored; access is checked again before it is used.
 */
export const LAST_PROJECT_COOKIE = 'growthos-last-project';

/** A year: the choice should outlive a session, not a person's habits. */
export const LAST_PROJECT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const PROJECT_PATH = /^\/orgs\/([A-Za-z0-9_-]+)\/projects\/([A-Za-z0-9_-]+)(?:\/|$)/;

/** The org and project a locale-less path is inside, or null. */
export function projectFromPath(pathWithoutLocale: string): { orgId: string; projectId: string } | null {
  const match = PROJECT_PATH.exec(pathWithoutLocale);
  return match ? { orgId: match[1]!, projectId: match[2]! } : null;
}

/** The cookie value is `<orgId>/<projectId>`; anything else reads as nothing. */
export function parseLastProject(value: string | undefined | null): { orgId: string; projectId: string } | null {
  const match = /^([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/.exec(value ?? '');
  return match ? { orgId: match[1]!, projectId: match[2]! } : null;
}
