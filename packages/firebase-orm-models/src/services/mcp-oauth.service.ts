import { createHash, randomBytes } from 'node:crypto';
import { can, err, ok, type Result } from '@growthos/shared';
import { McpOAuthClientModel } from '../models/mcp-oauth-client.model';
import { McpOAuthGrantModel } from '../models/mcp-oauth-grant.model';
import { ProjectModel } from '../models/project.model';
import { listRoleBindingsForUser, toPolicyBindings } from './organization.service';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';

/**
 * MCP OAuth 2.1 authorization server (KAN-75, plan `12 §6.1`): dynamic
 * client registration (RFC 7591-lite), authorization-code + PKCE (`S256`,
 * OAuth 2.1 mandates PKCE for every client), and refresh-token rotation.
 * One `McpOAuthGrantModel` doc carries the whole code -> access/refresh
 * lifecycle — see that model's own doc comment for why.
 *
 * The consent step itself (choosing which org/project to grant, verifying
 * the human actually holds `mcp.read` there) happens in `apps/web` — the
 * only place a Firebase session cookie and this codebase's i18n'd UI live —
 * which calls straight into {@link issueMcpAuthorizationCode} once the user
 * approves. `apps/api` (where the MCP resource server and the rest of this
 * OAuth protocol surface live) never sees a user session; it only ever
 * validates client/PKCE/token mechanics.
 */

export const MCP_READ_SCOPE = 'mcp:read';

const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const AUTH_CODE_BYTES = 32;
const TOKEN_BYTES = 32;

export class InvalidMcpOAuthClientError extends Error {
  constructor(message = 'Invalid MCP OAuth client or redirect_uri.') {
    super(message);
    this.name = 'InvalidMcpOAuthClientError';
  }
}

export class InsufficientMcpReadPermissionError extends Error {
  constructor() {
    super('This user does not hold mcp.read for the requested project.');
    this.name = 'InsufficientMcpReadPermissionError';
  }
}

export class McpOAuthGrantNotFoundError extends Error {
  constructor() {
    super('MCP OAuth grant not found in this project.');
    this.name = 'McpOAuthGrantNotFoundError';
  }
}

function hashSecret(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateOpaqueSecret(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

/** RFC 7636 `S256`: `code_challenge` must equal the base64url-encoded SHA-256 digest of `code_verifier`. Timing-safe-ish by construction — both sides are re-derived and compared as full strings rather than character-by-character, matching how every other hash-lookup credential in this package is checked (Firestore's own equality query, not a manual byte compare). */
function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  return createHash('sha256').update(codeVerifier).digest('base64url') === codeChallenge;
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface RegisterMcpOAuthClientParams {
  clientName: string;
  redirectUris: readonly string[];
}

/** Schemes that can execute script or render arbitrary content when navigated to — never a legitimate OAuth redirect target regardless of what `new URL(...)` happily parses. */
const DANGEROUS_REDIRECT_URI_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'about:']);
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * `POST /oauth/register` is public and unauthenticated (RFC 7591 dynamic
 * client registration has no gate — any MCP client self-registers), so this
 * is the only check standing between a caller and getting an arbitrary
 * string accepted as a "registered redirect_uri" a future consenting user
 * gets redirected to. `new URL(...)` not throwing is necessary but not
 * sufficient — `new URL('javascript:...')` parses cleanly. Rejects the
 * known script/content-executing schemes outright, and requires `https:`
 * for every host except loopback (`http:` is only ever safe for a native
 * app's own local redirect listener, per OAuth 2.1 §7.2's "loopback
 * interface redirection" guidance for public clients) — a custom app-scheme
 * redirect (e.g. `claude-desktop:`, `com.example.app:`) still passes, since
 * those can't be navigated to as executable content the way the denied
 * schemes can.
 */
function isValidRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (DANGEROUS_REDIRECT_URI_SCHEMES.has(parsed.protocol)) {
    return false;
  }
  if (parsed.protocol === 'http:' && !LOOPBACK_HOSTNAMES.has(parsed.hostname)) {
    return false;
  }
  return true;
}

/** Dynamic client registration (RFC 7591-lite) — any MCP client (Claude Desktop, claude.ai, a custom agent) self-registers before its first `/oauth/authorize` redirect. Always a public client; see `McpOAuthClientModel`'s own doc comment for why no secret is issued. */
export async function registerMcpOAuthClient(params: RegisterMcpOAuthClientParams): Promise<McpOAuthClientModel> {
  const clientName = params.clientName.trim();
  const redirectUris = [...new Set(params.redirectUris.map((uri) => uri.trim()))];
  if (clientName.length === 0) {
    throw new InvalidMcpOAuthClientError('client_name is required.');
  }
  if (redirectUris.length === 0 || !redirectUris.every(isValidRedirectUri)) {
    throw new InvalidMcpOAuthClientError('At least one valid redirect_uri is required.');
  }

  const client = new McpOAuthClientModel();
  client.client_name = clientName;
  client.redirect_uris = redirectUris;
  client.created_at = new Date().toISOString();
  await client.save();
  return client;
}

/** Validates a `(client_id, redirect_uri)` pair against a registered client — shared by both `/oauth/authorize` (before redirecting to the consent page) and `issueMcpAuthorizationCode` (defense in depth: the consent POST re-validates rather than trusting whatever the browser round-tripped). */
export async function requireRegisteredRedirectUri(clientId: string, redirectUri: string): Promise<McpOAuthClientModel> {
  const client = await McpOAuthClientModel.init(clientId);
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    throw new InvalidMcpOAuthClientError();
  }
  return client;
}

/** Whether `userId` currently holds `mcp.read` in `organizationId` — re-derived fresh from Firestore on every call (no caching), the same "revocation is immediate" posture every other credential check in this package takes. Exported so `apps/web`'s consent route can gate the grant *before* minting a code, and reused internally by {@link authenticateMcpAccessToken} to re-check on every MCP tool call. */
export async function currentUserHasMcpReadPermission(userId: string, organizationId: string): Promise<boolean> {
  const bindings = await listRoleBindingsForUser(userId, [organizationId]);
  return can(toPolicyBindings(bindings), { type: 'user', id: userId }, 'mcp.read', { orgId: organizationId });
}

export interface IssueMcpAuthorizationCodeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  organizationId: string;
  projectId: string;
  grantedByUserId: string;
}

export interface IssueMcpAuthorizationCodeResult {
  grant: McpOAuthGrantModel;
  code: string;
}

/**
 * Mints a single-use authorization code once a human has approved the
 * consent screen (`apps/web`) — the org/project scope and the granting
 * user's identity are fixed on the grant from this moment forward, never
 * re-picked later. Requires `code_challenge_method: 'S256'` (OAuth 2.1 §4.1.1
 * deprecates the plaintext `plain` method entirely) and that the caller
 * currently holds `mcp.read` for the chosen project — the same check
 * {@link authenticateMcpAccessToken} re-runs on every subsequent tool call,
 * so a grant issued to a user who is later demoted stops working immediately
 * rather than only at the next OAuth round-trip.
 */
export async function issueMcpAuthorizationCode(params: IssueMcpAuthorizationCodeParams): Promise<IssueMcpAuthorizationCodeResult> {
  if (params.codeChallengeMethod !== 'S256') {
    throw new InvalidMcpOAuthClientError('Only the S256 code_challenge_method is supported.');
  }
  await requireRegisteredRedirectUri(params.clientId, params.redirectUri);
  await requireProjectInOrg(params.organizationId, params.projectId);

  const hasPermission = await currentUserHasMcpReadPermission(params.grantedByUserId, params.organizationId);
  if (!hasPermission) {
    throw new InsufficientMcpReadPermissionError();
  }

  const code = generateOpaqueSecret(AUTH_CODE_BYTES);
  const now = new Date();

  const grant = new McpOAuthGrantModel();
  grant.client_id = params.clientId;
  grant.organization_id = params.organizationId;
  grant.project_id = params.projectId;
  grant.granted_by_user_id = params.grantedByUserId;
  grant.scope = MCP_READ_SCOPE;
  grant.redirect_uri = params.redirectUri;
  grant.code_challenge = params.codeChallenge;
  grant.code_challenge_method = params.codeChallengeMethod;
  grant.code_hash = hashSecret(code);
  grant.code_expires_at = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  grant.created_at = now.toISOString();
  await grant.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.grantedByUserId,
      action: 'mcp_oauth_grant.issue',
      targetType: 'mcp_oauth_grant',
      targetId: grant.id,
      summary: `Authorized an MCP connection (client ${params.clientId}) for scope "${grant.scope}"`,
      after: { clientId: params.clientId, scope: grant.scope },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful consent into a failure for the caller.
  }

  return { grant, code };
}

function mintTokenPair(grant: McpOAuthGrantModel, now: Date): { accessToken: string; refreshToken: string } {
  const accessToken = generateOpaqueSecret(TOKEN_BYTES);
  const refreshToken = generateOpaqueSecret(TOKEN_BYTES);
  grant.access_token_hash = hashSecret(accessToken);
  grant.access_token_expires_at = new Date(now.getTime() + ACCESS_TOKEN_TTL_MS).toISOString();
  grant.refresh_token_hash = hashSecret(refreshToken);
  grant.refresh_token_expires_at = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS).toISOString();
  return { accessToken, refreshToken };
}

export interface McpOAuthTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope: string;
}

export type McpOAuthTokenFailureReason =
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_code_verifier'
  | 'grant_revoked';

export interface McpOAuthTokenFailure {
  reason: McpOAuthTokenFailureReason;
  message: string;
}

export interface ExchangeMcpAuthorizationCodeParams {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

/** Finds the (at most one) grant whose `code_hash` matches — codes are single-use and generated from `AUTH_CODE_BYTES` of randomness, so a hash collision across two live grants is not a real-world concern (same assumption `findLiveApiKeyByRawKey` already makes for keys). */
async function findGrantByCodeHash(codeHash: string): Promise<McpOAuthGrantModel | undefined> {
  const matches = await McpOAuthGrantModel.query().where('code_hash', '==', codeHash).limit(1).get();
  return matches[0];
}

async function findGrantByRefreshTokenHash(refreshTokenHash: string): Promise<McpOAuthGrantModel | undefined> {
  const matches = await McpOAuthGrantModel.query().where('refresh_token_hash', '==', refreshTokenHash).limit(1).get();
  return matches[0];
}

async function findGrantByAccessTokenHash(accessTokenHash: string): Promise<McpOAuthGrantModel | undefined> {
  const matches = await McpOAuthGrantModel.query().where('access_token_hash', '==', accessTokenHash).limit(1).get();
  return matches[0];
}

/**
 * Exchanges a single-use authorization code for an access/refresh token pair
 * (OAuth 2.1 §4.1.3), verifying PKCE (§4.1.3's mandatory `code_verifier`
 * check) and that `client_id`/`redirect_uri` match exactly what the code was
 * issued for.
 *
 * Not transactional: the read-then-write on `code_redeemed_at` below (look
 * up an unredeemed code, then save it as redeemed) has the same narrow
 * concurrent-write race every other multi-step Firestore read/write in this
 * package documents and accepts — this ORM's client-SDK-based API exposes no
 * transaction primitive (see `claimTvPairing`'s doc comment in
 * `tv-pairing.service.ts` for the fullest statement of this codebase-wide
 * tradeoff). Two callers redeeming the exact same still-valid code within
 * the same instant would race on which write wins; the losing caller's
 * returned token pair would never authenticate. Low real-world likelihood
 * (a code is single-use, 5-minute-lived, and only ever known to the one
 * client that received the `/oauth/authorize` redirect) but a real gap, not
 * a silent one — same posture as `refreshMcpAccessToken` below.
 */
export async function exchangeMcpAuthorizationCode(
  params: ExchangeMcpAuthorizationCodeParams,
): Promise<Result<McpOAuthTokenResult, McpOAuthTokenFailure>> {
  const grant = await findGrantByCodeHash(hashSecret(params.code));
  if (!grant) {
    return err({ reason: 'invalid_grant', message: 'Unknown or already-redeemed authorization code.' });
  }
  if (grant.revoked_at) {
    return err({ reason: 'grant_revoked', message: 'This authorization has been revoked.' });
  }
  if (grant.code_redeemed_at) {
    return err({ reason: 'invalid_grant', message: 'This authorization code has already been redeemed.' });
  }
  if (grant.code_expires_at < new Date().toISOString()) {
    return err({ reason: 'invalid_grant', message: 'This authorization code has expired.' });
  }
  if (grant.client_id !== params.clientId || grant.redirect_uri !== params.redirectUri) {
    return err({ reason: 'invalid_client', message: 'client_id/redirect_uri do not match the authorization request.' });
  }
  if (!verifyPkce(params.codeVerifier, grant.code_challenge)) {
    return err({ reason: 'invalid_code_verifier', message: 'code_verifier does not match the original code_challenge.' });
  }

  const now = new Date();
  grant.code_redeemed_at = now.toISOString();
  const { accessToken, refreshToken } = mintTokenPair(grant, now);
  grant.last_used_at = now.toISOString();
  await grant.save();

  return ok({ accessToken, refreshToken, expiresInSeconds: ACCESS_TOKEN_TTL_MS / 1000, scope: grant.scope });
}

export interface RefreshMcpAccessTokenParams {
  refreshToken: string;
  clientId: string;
}

/**
 * Rotates both the access and refresh token together (OAuth 2.1 §4.3.1
 * recommends refresh-token rotation for public clients) — the presented
 * `refreshToken` is invalidated the instant a new pair is minted, so a
 * stolen-and-replayed refresh token can be used at most once before the
 * legitimate client's next refresh silently invalidates it too (a
 * detectable "refresh token reuse" signal a future story could alert on;
 * not built here). Same not-transactional read-then-write caveat as
 * {@link exchangeMcpAuthorizationCode} above — two concurrent refreshes of
 * the exact same token would race on which write wins, so "used at most
 * once" is a design intent this doc comment states honestly, not a
 * guarantee enforced against true concurrent replay.
 */
export async function refreshMcpAccessToken(
  params: RefreshMcpAccessTokenParams,
): Promise<Result<McpOAuthTokenResult, McpOAuthTokenFailure>> {
  const grant = await findGrantByRefreshTokenHash(hashSecret(params.refreshToken));
  if (!grant) {
    return err({ reason: 'invalid_grant', message: 'Unknown refresh token.' });
  }
  if (grant.revoked_at) {
    return err({ reason: 'grant_revoked', message: 'This authorization has been revoked.' });
  }
  if (grant.client_id !== params.clientId) {
    return err({ reason: 'invalid_client', message: 'client_id does not match this refresh token.' });
  }
  if (!grant.refresh_token_expires_at || grant.refresh_token_expires_at < new Date().toISOString()) {
    return err({ reason: 'invalid_grant', message: 'This refresh token has expired.' });
  }

  const hasPermission = await currentUserHasMcpReadPermission(grant.granted_by_user_id, grant.organization_id);
  if (!hasPermission) {
    return err({ reason: 'grant_revoked', message: 'The granting user no longer holds mcp.read for this project.' });
  }

  const now = new Date();
  const { accessToken, refreshToken } = mintTokenPair(grant, now);
  grant.last_used_at = now.toISOString();
  await grant.save();

  return ok({ accessToken, refreshToken, expiresInSeconds: ACCESS_TOKEN_TTL_MS / 1000, scope: grant.scope });
}

export interface McpOAuthPrincipal {
  organizationId: string;
  projectId: string;
  userId: string;
  scope: string;
  /** The granted `McpOAuthGrantModel` id — the audit-trail "client identity" key for this connection (KAN-77), distinct from `userId` (the granting human, i.e. the principal). */
  grantId: string;
  /** The registered `McpOAuthClientModel` id the grant was issued to — which third-party application this human authorized, not who authorized it. */
  clientId: string;
}

export type McpAccessTokenAuthFailureReason = 'invalid_token' | 'insufficient_permission';

export interface McpAccessTokenAuthFailure {
  reason: McpAccessTokenAuthFailureReason;
  message: string;
}

/**
 * Authenticates an MCP bearer access token and re-verifies, fresh on every
 * call, that the human who granted it still holds `mcp.read` for that
 * project (plan `12 §6.1`: "MCP grants nothing the underlying principal
 * doesn't have") — a grant surviving as `revoked_at: undefined` is not
 * enough on its own; a role change or membership removal since the grant
 * was issued must take effect immediately, the same as every other
 * permission check in this codebase.
 */
export async function authenticateMcpAccessToken(rawToken: string): Promise<Result<McpOAuthPrincipal, McpAccessTokenAuthFailure>> {
  const grant = await findGrantByAccessTokenHash(hashSecret(rawToken));
  if (!grant || grant.revoked_at) {
    return err({ reason: 'invalid_token', message: 'Invalid or revoked MCP access token.' });
  }
  if (!grant.access_token_expires_at || grant.access_token_expires_at < new Date().toISOString()) {
    return err({ reason: 'invalid_token', message: 'This MCP access token has expired.' });
  }

  const hasPermission = await currentUserHasMcpReadPermission(grant.granted_by_user_id, grant.organization_id);
  if (!hasPermission) {
    return err({ reason: 'insufficient_permission', message: 'The granting user no longer holds mcp.read for this project.' });
  }

  grant.last_used_at = new Date().toISOString();
  await grant.save();

  return ok({
    organizationId: grant.organization_id,
    projectId: grant.project_id,
    userId: grant.granted_by_user_id,
    scope: grant.scope,
    grantId: grant.id,
    clientId: grant.client_id,
  });
}

async function loadGrantInProject(organizationId: string, projectId: string, grantId: string): Promise<McpOAuthGrantModel> {
  const grant = await McpOAuthGrantModel.init(grantId);
  if (!grant || grant.organization_id !== organizationId || grant.project_id !== projectId) {
    throw new McpOAuthGrantNotFoundError();
  }
  return grant;
}

export interface McpOAuthGrantSummary {
  id: string;
  clientId: string;
  grantedByUserId: string;
  scope: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
  /**
   * Whether this grant is currently usable: a code was redeemed for an
   * access token at some point (not still "pending" — a grant approved on
   * the consent screen but never completed by the client, e.g. the user
   * backed out or the client crashed mid-flow), it isn't revoked, and its
   * `refresh_token_expires_at` (the longer-lived of the two TTLs, so the
   * one that actually determines whether the client can still recover a
   * live access token via `refreshMcpAccessToken`) hasn't passed. Checked
   * at read time, not maintained as a stored field, so a connection that
   * silently expired a month ago (no refresh, no explicit revoke) shows up
   * honestly as inactive rather than forever "connected" the moment
   * `access_token_hash` was first set.
   */
  isActive: boolean;
}

function toGrantSummary(grant: McpOAuthGrantModel): McpOAuthGrantSummary {
  const now = new Date().toISOString();
  const isLive = Boolean(grant.refresh_token_expires_at) && grant.refresh_token_expires_at! >= now;
  return {
    id: grant.id,
    clientId: grant.client_id,
    grantedByUserId: grant.granted_by_user_id,
    scope: grant.scope,
    createdAt: grant.created_at,
    lastUsedAt: grant.last_used_at,
    revokedAt: grant.revoked_at,
    isActive: Boolean(grant.access_token_hash) && !grant.revoked_at && isLive,
  };
}

/** Every MCP OAuth grant issued for a project (active, pending, or revoked) — the admin-facing "MCP connections" list (KAN-75's project Keys page section). */
export async function listMcpOAuthGrantsForProject(organizationId: string, projectId: string): Promise<McpOAuthGrantSummary[]> {
  const grants = await McpOAuthGrantModel.query()
    .where('organization_id', '==', organizationId)
    .where('project_id', '==', projectId)
    .get();
  return grants.map(toGrantSummary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface RevokeMcpOAuthGrantParams {
  organizationId: string;
  projectId: string;
  grantId: string;
  revokedByUserId: string;
}

/** Revokes an MCP OAuth grant immediately (mirrors `revokeApiKey`'s idempotent "safe to retry" shape) — any project member with `keys.manage` may revoke any grant on their project, not only the user who originally approved it, the same "an admin can kill any of their project's credentials" posture the Keys page already establishes for API keys. */
export async function revokeMcpOAuthGrant(params: RevokeMcpOAuthGrantParams): Promise<McpOAuthGrantModel> {
  const grant = await loadGrantInProject(params.organizationId, params.projectId, params.grantId);
  grant.revoked_at = new Date().toISOString();
  grant.revoked_by = params.revokedByUserId;
  await grant.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.revokedByUserId,
      action: 'mcp_oauth_grant.revoke',
      targetType: 'mcp_oauth_grant',
      targetId: grant.id,
      summary: `Revoked MCP connection (client ${grant.client_id})`,
    });
  } catch {
    // Best-effort — see the comment in issueMcpAuthorizationCode above.
  }

  return grant;
}
