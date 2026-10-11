import { API_KEY_KINDS, API_KEY_SCOPES, type ApiKeyKind, type ApiKeyScope } from '@growthos/shared';

/** The anchor of the "Create a key" card on the Keys page. */
export const CREATE_API_KEY_ANCHOR = 'create-key';

/** What a link into the Keys page can preselect in the create form. */
export interface CreateApiKeyPreset {
  kind?: ApiKeyKind;
  environmentId?: string;
  scopes?: ApiKeyScope[];
}

/**
 * A link to the Keys page with the create form preset to the kind of key a caller needs: a browser
 * key for the website, or a server key that can write events (`ingest.write`) for the server SDK,
 * relay and CLI. `keysPath` is the project's keys page, e.g. `/orgs/o/projects/p/keys`.
 */
export function createApiKeyHref(
  keysPath: string,
  kind: ApiKeyKind,
  environmentId: string | null | undefined,
): string {
  const query = new URLSearchParams({ kind });
  if (environmentId) query.set('environmentId', environmentId);
  if (kind === 'secret') query.set('scopes', 'ingest.write');
  return `${keysPath}?${query.toString()}#${CREATE_API_KEY_ANCHOR}`;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the preset back from the Keys page's search params, dropping anything unknown. */
export function parseCreateApiKeyPreset(
  searchParams: Record<string, string | string[] | undefined>,
): CreateApiKeyPreset {
  const kind = first(searchParams.kind);
  const environmentId = first(searchParams.environmentId)?.trim();
  const scopes = (first(searchParams.scopes) ?? '')
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope): scope is ApiKeyScope => (API_KEY_SCOPES as readonly string[]).includes(scope));
  return {
    ...((API_KEY_KINDS as readonly string[]).includes(kind ?? '')
      ? { kind: kind as ApiKeyKind }
      : {}),
    ...(environmentId ? { environmentId } : {}),
    ...(scopes.length ? { scopes } : {}),
  };
}
