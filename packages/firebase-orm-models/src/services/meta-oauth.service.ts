import { createHash, randomBytes } from 'node:crypto';
import { MetaOAuthSessionModel, type MetaOAuthAdAccount, type MetaOAuthPage } from '../models/meta-oauth-session.model';
import type { SharedCredentialModel } from '../models/shared-credential.model';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';
import type { ResourceAttachmentModel } from '../models/resource-attachment.model';
import { decryptSecret, encryptSecret, type KmsProvider } from '../vault';
import { META_API_VERSION } from '../plugin-runtime/meta-ads/api-client';
import { parseMetaAdsCredentialSecret } from '../plugin-runtime/meta-ads/credential-secret';
import { createSharedCredential, listActiveAttachmentsForProject, listSharedCredentials, pushResourceAttachment, setResourceAttachmentWriteTier } from './resource-library.service';
import { setSharedCredentialSecret } from './vault.service';
import { recordAuditLogEntry } from './audit-log.service';

/**
 * "Connect with Facebook": the OAuth flow that turns a person's Meta login into a Meta Ads shared
 * credential attached to a project, ready for Ad Studio to publish with. Replaces the four manual
 * steps (create credential, paste a token, attach, set write tier) and the short-lived pasted token
 * that expired an hour after it was saved.
 *
 * 1. `startMetaOAuth` records a single-use session and returns Meta's consent URL.
 * 2. `completeMetaOAuth` (the callback) exchanges the code for a long-lived token, lists the ad
 *    accounts and Pages the person can use, and keeps the token sealed on the session.
 * 3. `finishMetaOAuth` (the person's pick) writes the credential - updating the one already holding
 *    that ad account, so reconnecting refreshes it - attaches it with the `manage` tier, and deletes
 *    the session.
 *
 * Only the person who started a session can complete or finish it, within its time limit. The token
 * never leaves the vault in plain text except inside `finishMetaOAuth`, in memory.
 */

/** What the flow asks for by default: manage ads, read them, list the person's businesses and Pages, and read a Page to post as it. */
export const META_OAUTH_SCOPES = ['ads_management', 'ads_read', 'business_management', 'pages_show_list', 'pages_read_engagement'] as const;
export const META_OAUTH_SESSION_TTL_MS = 15 * 60 * 1000;
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;
const DIALOG = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`;

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  /** A Facebook Login for Business configuration id; when set it replaces the `scope` list. */
  loginConfigId?: string | null;
  /** Overrides {@link META_OAUTH_SCOPES} (Meta sometimes refuses a permission for an app type). */
  scopes?: readonly string[] | null;
  /** Must match a Valid OAuth Redirect URI on the Meta app exactly. */
  redirectUri: string;
}

export type MetaOAuthErrorCode = 'session_not_found' | 'session_expired' | 'wrong_user' | 'not_authorized' | 'exchange_failed' | 'invalid_choice' | 'no_ad_accounts';

export class MetaOAuthError extends Error {
  constructor(
    public readonly code: MetaOAuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'MetaOAuthError';
  }
}

type FetchImpl = typeof fetch;

function hashState(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}

function sessionTenant(session: MetaOAuthSessionModel): string {
  return `${session.organization_id}:meta_oauth:${session.id}`;
}

/** An app-relative path only (`/en/...`), never an absolute or protocol-relative URL - no open redirect. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}

export async function startMetaOAuth(params: {
  organizationId: string;
  projectId?: string | null;
  userId: string;
  locale: string;
  returnTo?: string | null;
  config: MetaOAuthConfig;
  now?: Date;
}): Promise<{ state: string; authorizeUrl: string }> {
  const now = params.now ?? new Date();
  const state = randomBytes(32).toString('hex');
  const session = new MetaOAuthSessionModel();
  session.state_hash = hashState(state);
  session.organization_id = params.organizationId;
  session.project_id = params.projectId ?? null;
  session.user_id = params.userId;
  session.locale = params.locale;
  session.return_to = safeReturnTo(params.returnTo);
  session.status = 'started';
  session.created_on = now.toISOString();
  session.expires_on = new Date(now.getTime() + META_OAUTH_SESSION_TTL_MS).toISOString();
  await session.save();

  const url = new URL(DIALOG);
  url.searchParams.set('client_id', params.config.appId);
  url.searchParams.set('redirect_uri', params.config.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  if (params.config.loginConfigId) url.searchParams.set('config_id', params.config.loginConfigId);
  else url.searchParams.set('scope', (params.config.scopes?.length ? params.config.scopes : META_OAUTH_SCOPES).join(','));
  return { state, authorizeUrl: url.toString() };
}

async function findSession(state: string): Promise<MetaOAuthSessionModel | undefined> {
  const matches = await MetaOAuthSessionModel.query().where('state_hash', '==', hashState(state)).limit(1).get();
  return matches[0];
}

/** The session behind `state`, checked: it exists, has not expired, and belongs to `userId`. */
async function requireSession(state: string, userId: string, now: Date): Promise<MetaOAuthSessionModel> {
  const session = state ? await findSession(state) : undefined;
  if (!session) throw new MetaOAuthError('session_not_found');
  if (new Date(session.expires_on).getTime() <= now.getTime()) throw new MetaOAuthError('session_expired');
  if (session.user_id !== userId) throw new MetaOAuthError('wrong_user');
  return session;
}

/** Which org, project, locale and return path a session belongs to, for routing a callback even when it failed. */
export async function peekMetaOAuthSession(state: string): Promise<{ organizationId: string; projectId: string | null; locale: string; returnTo: string | null } | null> {
  const session = state ? await findSession(state) : undefined;
  return session ? { organizationId: session.organization_id, projectId: session.project_id ?? null, locale: session.locale, returnTo: session.return_to ?? null } : null;
}

async function graphGet<T>(fetchImpl: FetchImpl, path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), { method: 'GET' });
  } catch (error) {
    throw new MetaOAuthError('exchange_failed', error instanceof Error ? error.message : String(error));
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok || body.error) throw new MetaOAuthError('exchange_failed', body.error?.message ?? `Meta answered ${response.status}`);
  return body;
}

export async function completeMetaOAuth(params: { state: string; code: string; userId: string; config: MetaOAuthConfig; kms: KmsProvider; fetchImpl?: FetchImpl; now?: Date }): Promise<MetaOAuthSessionModel> {
  const now = params.now ?? new Date();
  const fetchImpl = params.fetchImpl ?? fetch;
  const session = await requireSession(params.state, params.userId, now);
  if (session.status !== 'started') throw new MetaOAuthError('session_not_found');

  const short = await graphGet<{ access_token?: string; expires_in?: number }>(fetchImpl, 'oauth/access_token', {
    client_id: params.config.appId,
    client_secret: params.config.appSecret,
    redirect_uri: params.config.redirectUri,
    code: params.code,
  });
  if (!short.access_token) throw new MetaOAuthError('exchange_failed', 'Meta returned no access token.');
  // A Facebook Login for Business configuration issues a business (system-user) token for the code: it
  // belongs to the business, not the person, so it is not caught by personal-account security checks
  // when used from a server, and it is used as issued. A personal login token is swapped for a
  // long-lived one.
  const long = params.config.loginConfigId
    ? short
    : await graphGet<{ access_token?: string; expires_in?: number }>(fetchImpl, 'oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: params.config.appId,
        client_secret: params.config.appSecret,
        fb_exchange_token: short.access_token,
      });
  const token = long.access_token ?? short.access_token;
  const expiresIn = typeof long.expires_in === 'number' && long.expires_in > 0 ? long.expires_in : null;

  const accounts = await graphGet<{ data?: { account_id?: string; name?: string; currency?: string; account_status?: number }[] }>(fetchImpl, 'me/adaccounts', {
    fields: 'account_id,name,currency,account_status',
    limit: '200',
    access_token: token,
  });
  const pages = await graphGet<{ data?: { id?: string; name?: string }[] }>(fetchImpl, 'me/accounts', { fields: 'id,name', limit: '200', access_token: token });

  session.ad_accounts = (accounts.data ?? [])
    .filter((entry): entry is { account_id: string; name?: string; currency?: string; account_status?: number } => typeof entry.account_id === 'string' && entry.account_id.length > 0)
    .map((entry): MetaOAuthAdAccount => ({ id: entry.account_id, name: entry.name ?? entry.account_id, currency: entry.currency ?? null, status: entry.account_status ?? null }));
  session.pages = (pages.data ?? [])
    .filter((entry): entry is { id: string; name?: string } => typeof entry.id === 'string' && entry.id.length > 0)
    .map((entry): MetaOAuthPage => ({ id: entry.id, name: entry.name ?? entry.id }));
  session.encrypted_token = await encryptSecret(token, sessionTenant(session), params.kms);
  session.token_expires_on = expiresIn ? new Date(now.getTime() + expiresIn * 1000).toISOString() : null;
  session.status = 'authorized';
  await session.save();
  return session;
}

export interface MetaOAuthChoices {
  organizationId: string;
  projectId: string | null;
  returnTo: string | null;
  adAccounts: MetaOAuthAdAccount[];
  pages: MetaOAuthPage[];
  tokenExpiresOn: string | null;
  expiresOn: string;
}

/** What the person can pick from, for the choose page. Never includes the token. */
export async function describeMetaOAuthSession(params: { state: string; userId: string; now?: Date }): Promise<MetaOAuthChoices> {
  const session = await requireSession(params.state, params.userId, params.now ?? new Date());
  if (session.status !== 'authorized') throw new MetaOAuthError('not_authorized');
  return {
    organizationId: session.organization_id,
    projectId: session.project_id ?? null,
    returnTo: session.return_to ?? null,
    adAccounts: session.ad_accounts ?? [],
    pages: session.pages ?? [],
    tokenExpiresOn: session.token_expires_on ?? null,
    expiresOn: session.expires_on,
  };
}

async function findCredentialForAdAccount(organizationId: string, adAccountId: string): Promise<SharedCredentialModel | undefined> {
  const credentials = await listSharedCredentials(organizationId);
  return credentials.find((credential) => credential.provider === 'meta_ads' && !credential.archived_at && (credential.available_scopes ?? []).includes(adAccountId));
}

export async function finishMetaOAuth(params: {
  /** The org the request is for; a session of another org is refused before anything is written. */
  organizationId: string;
  state: string;
  userId: string;
  adAccountId: string;
  pageId: string;
  projectId?: string | null;
  kms: KmsProvider;
  now?: Date;
}): Promise<{ credential: SharedCredentialModel; attachment: ResourceAttachmentModel | null; returnTo: string | null; created: boolean }> {
  const now = params.now ?? new Date();
  const session = await requireSession(params.state, params.userId, now);
  if (session.organization_id !== params.organizationId) throw new MetaOAuthError('session_not_found');
  if (session.status !== 'authorized' || !session.encrypted_token) throw new MetaOAuthError('not_authorized');
  const account = (session.ad_accounts ?? []).find((entry) => entry.id === params.adAccountId);
  const page = (session.pages ?? []).find((entry) => entry.id === params.pageId);
  if (!account || !page) throw new MetaOAuthError('invalid_choice');
  const organizationId = session.organization_id;
  const projectId = params.projectId === undefined ? (session.project_id ?? null) : params.projectId;

  if (projectId) {
    const project = await ProjectModel.init(projectId, { organization_id: organizationId });
    if (!project || project.organization_id !== organizationId) throw new ProjectNotFoundError();
  }

  const token = await decryptSecret(session.encrypted_token, sessionTenant(session), params.kms);
  const secret = JSON.stringify({ accessToken: token, adAccountId: account.id, pageId: page.id });
  parseMetaAdsCredentialSecret(secret);

  const existing = await findCredentialForAdAccount(organizationId, account.id);
  const credential =
    existing ??
    (await createSharedCredential({
      organizationId,
      name: `Meta Ads - ${account.name} (act_${account.id})`,
      provider: 'meta_ads',
      availableScopes: [account.id],
      createdByUserId: params.userId,
    }));
  const sealed = await setSharedCredentialSecret({ organizationId, credentialId: credential.id, secret, kms: params.kms, actorId: params.userId });
  sealed.token_expires_on = session.token_expires_on ?? null;
  sealed.connected_via = 'oauth';
  await sealed.save();

  let attachment: ResourceAttachmentModel | null = null;
  if (projectId) {
    const attached = (await listActiveAttachmentsForProject(organizationId, projectId)).find((entry) => entry.resource_kind === 'credential' && entry.resource_id === credential.id);
    attachment =
      attached ??
      (await pushResourceAttachment({ organizationId, projectId, resourceKind: 'credential', resourceId: credential.id, pushedByUserId: params.userId, scopeSelection: [account.id] }));
    if (attachment.write_tier !== 'manage') {
      attachment = await setResourceAttachmentWriteTier({ organizationId, attachmentId: attachment.id, tier: 'manage', actorId: params.userId });
    }
  }

  try {
    await recordAuditLogEntry({
      organizationId,
      ...(projectId ? { projectId } : {}),
      actorType: 'user',
      actorId: params.userId,
      action: existing ? 'meta.reconnected' : 'meta.connected',
      targetType: 'shared_credential',
      targetId: credential.id,
      summary: `${existing ? 'Reconnected' : 'Connected'} Meta ad account act_${account.id} with the Page "${page.name}"`,
      after: { ad_account_id: account.id, page_id: page.id, token_expires_on: session.token_expires_on ?? null, project_id: projectId },
    });
  } catch {
    // Best-effort, like every other audit write.
  }
  await session.remove();
  return { credential: sealed, attachment, returnTo: session.return_to ?? null, created: !existing };
}
