import { isEnvironment, type Environment } from '@growthos/shared';

/**
 * The per-project environment selection (KAN-196) lives in a cookie rather than a search param
 * because the project layout renders the picker and layouts cannot read `searchParams`. The value
 * is an environment NAME (`dev|staging|prod`), never an id, so a stale or hand-edited cookie can
 * only ever pick one of the project's own environments. It is a display preference, not a
 * credential, so it is client-set and not httpOnly.
 */
export const ENVIRONMENT_COOKIE_PREFIX = 'gos_env_';

/** One year — the preference should outlive a session, same as a theme or locale choice. */
export const ENVIRONMENT_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** The environment every project page shows until someone picks another. */
export const DEFAULT_SELECTED_ENVIRONMENT: Environment = 'prod';

export function environmentCookieName(projectId: string): string {
  return `${ENVIRONMENT_COOKIE_PREFIX}${projectId}`;
}

/** The `document.cookie` assignment string that records `environment` as the project's selection. */
export function serializeEnvironmentCookie(projectId: string, environment: Environment): string {
  return `${environmentCookieName(projectId)}=${environment}; Path=/; Max-Age=${ENVIRONMENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

/**
 * Resolves the environment a project page reads from the project's own environments and the raw
 * cookie value: the named environment when the cookie holds a valid name the project actually has,
 * otherwise `prod`, otherwise the project's first environment, otherwise `null` (a project whose
 * provisioning partially failed and has none — callers then pass no environment filter, the same
 * fallback `resolveDefaultQueryEnvironment` gives).
 */
export function pickSelectedEnvironment<T extends { name: string }>(environments: readonly T[], cookieValue: string | undefined): T | null {
  const requested = cookieValue !== undefined && isEnvironment(cookieValue) ? cookieValue : undefined;
  const byName = (name: string): T | undefined => environments.find((environment) => environment.name === name);
  return (requested !== undefined ? byName(requested) : undefined) ?? byName(DEFAULT_SELECTED_ENVIRONMENT) ?? environments[0] ?? null;
}
