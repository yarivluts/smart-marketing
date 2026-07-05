import { createHash, randomBytes } from 'node:crypto';
import {
  API_KEY_PREFIXES,
  type ApiKeyScope,
  apiKeyModeForEnvironment,
  err,
  isApiKeyScope,
  ok,
  type Result,
} from '@growthos/shared';
import { ApiKeyModel } from '../models/api-key.model';
import { EnvironmentModel } from '../models/environment.model';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';

export class EnvironmentNotFoundError extends Error {
  constructor() {
    super('Environment not found in this project.');
    this.name = 'EnvironmentNotFoundError';
  }
}

export class InvalidApiKeyScopeError extends Error {
  constructor() {
    super('An API key must carry at least one valid scope.');
    this.name = 'InvalidApiKeyScopeError';
  }
}

export class ApiKeyNotFoundError extends Error {
  constructor() {
    super('API key not found in this project.');
    this.name = 'ApiKeyNotFoundError';
  }
}

// 24 random bytes (base64url) comfortably exceeds what's brute-forceable and
// matches the entropy other bearer-token schemes (e.g. Stripe's) use.
const SECRET_BYTES = 24;
// How many characters of the random secret (beyond the gos_live_/gos_test_
// prefix) are safe to keep visible in `key_prefix` for admin-UI display —
// enough to tell two keys apart at a glance, nowhere near enough to guess
// the rest of the secret.
const DISPLAY_SECRET_CHARS = 8;

function hashSecret(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

async function requireEnvironmentInProject(
  organizationId: string,
  projectId: string,
  environmentId: string,
): Promise<EnvironmentModel> {
  const environment = await EnvironmentModel.init(environmentId, {
    organization_id: organizationId,
    project_id: projectId,
  });
  if (!environment || environment.project_id !== projectId) {
    throw new EnvironmentNotFoundError();
  }
  return environment;
}

async function loadApiKey(organizationId: string, projectId: string, apiKeyId: string): Promise<ApiKeyModel> {
  const apiKey = await ApiKeyModel.init(apiKeyId, { organization_id: organizationId, project_id: projectId });
  if (!apiKey || apiKey.organization_id !== organizationId || apiKey.project_id !== projectId) {
    throw new ApiKeyNotFoundError();
  }
  return apiKey;
}

export interface MintApiKeyParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  name: string;
  scopes: readonly ApiKeyScope[];
  createdByUserId: string;
}

export interface MintApiKeyResult {
  apiKey: ApiKeyModel;
  /**
   * The full raw key (`gos_live_...`/`gos_test_...`). Only ever available
   * here, at mint time — `ApiKeyModel` only ever persists its hash, so this
   * is the caller's one chance to display/return it (the "copy-once"
   * pattern; re-showing it later is a UI concern for KAN-30, not something
   * this service can do since the raw value isn't retrievable again).
   */
  rawKey: string;
}

/** Mints a new key scoped to one project + environment (KAN-28). */
export async function mintApiKey(params: MintApiKeyParams): Promise<MintApiKeyResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  const environment = await requireEnvironmentInProject(
    params.organizationId,
    params.projectId,
    params.environmentId,
  );

  if (params.scopes.length === 0 || !params.scopes.every(isApiKeyScope)) {
    throw new InvalidApiKeyScopeError();
  }

  const prefix = API_KEY_PREFIXES[apiKeyModeForEnvironment(environment.name)];
  const rawKey = `${prefix}${randomBytes(SECRET_BYTES).toString('base64url')}`;

  const apiKey = new ApiKeyModel();
  apiKey.name = params.name;
  apiKey.organization_id = params.organizationId;
  apiKey.project_id = params.projectId;
  apiKey.environment_id = params.environmentId;
  apiKey.key_prefix = rawKey.slice(0, prefix.length + DISPLAY_SECRET_CHARS);
  apiKey.hashed_secret = hashSecret(rawKey);
  apiKey.scopes = [...params.scopes];
  apiKey.created_by = params.createdByUserId;
  apiKey.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await apiKey.save();

  return { apiKey, rawKey };
}

export interface ApiKeyAuthContext {
  apiKey: ApiKeyModel;
  organizationId: string;
  projectId: string;
  environmentId: string;
  scopes: readonly ApiKeyScope[];
}

export interface VerifyApiKeyParams {
  rawKey: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  requiredScope: ApiKeyScope;
}

/**
 * Authenticates and authorizes an incoming request's bearer key against the
 * project/environment/scope it's claimed for (KAN-28 AC: "key auths a
 * request; wrong env/project/scope -> 403; revoke is immediate"). Returns a
 * `Result` rather than throwing so a route/guard layer (KAN-32's ingest API
 * is the first real consumer) can map every rejection uniformly to 403
 * without a try/catch per failure mode.
 *
 * The raw key carries no org/project/environment info of its own — it's
 * looked up purely by its hash (a Firestore collection-group query across
 * every project's `api_keys`, same pattern as `listMembershipsForUser`) and
 * only *then* checked against what the caller expected. This also means a
 * key minted for one org can never accidentally authenticate a request
 * against a different org's project, even if a project/environment id
 * collided (Firestore ids don't, but the check costs nothing and matches
 * KAN-26's hard-isolation posture).
 *
 * Revocation is immediate because there is no caching layer here: every call
 * re-reads the key's current `revoked_at` from Firestore.
 */
export async function verifyApiKeyForRequest(params: VerifyApiKeyParams): Promise<Result<ApiKeyAuthContext, string>> {
  const hashedSecret = hashSecret(params.rawKey);
  const matches = await ApiKeyModel.collectionQuery().where('hashed_secret', '==', hashedSecret).limit(1).get();
  const apiKey = matches[0];

  if (!apiKey) {
    return err('Invalid API key.');
  }
  if (apiKey.revoked_at) {
    return err('This API key has been revoked.');
  }
  if (apiKey.organization_id !== params.organizationId || apiKey.project_id !== params.projectId) {
    return err('This API key is not valid for the requested project.');
  }
  if (apiKey.environment_id !== params.environmentId) {
    return err('This API key is not valid for the requested environment.');
  }
  if (!apiKey.scopes.includes(params.requiredScope)) {
    return err('This API key does not carry the required scope.');
  }

  apiKey.last_used_at = new Date().toISOString();
  await apiKey.save();

  return ok({
    apiKey,
    organizationId: apiKey.organization_id,
    projectId: apiKey.project_id,
    environmentId: apiKey.environment_id,
    scopes: apiKey.scopes,
  });
}

export interface RevokeApiKeyParams {
  organizationId: string;
  projectId: string;
  apiKeyId: string;
  revokedByUserId: string;
}

/**
 * Revokes a key immediately (KAN-28 AC). Idempotent by design — re-revoking
 * an already-revoked key just refreshes `revoked_at`/`revoked_by` rather
 * than throwing, the same "safe to retry" reasoning as
 * `removeMembershipCascade`; the key is dead either way.
 */
export async function revokeApiKey(params: RevokeApiKeyParams): Promise<ApiKeyModel> {
  const apiKey = await loadApiKey(params.organizationId, params.projectId, params.apiKeyId);
  apiKey.revoked_at = new Date().toISOString();
  apiKey.revoked_by = params.revokedByUserId;
  await apiKey.save();
  return apiKey;
}

/** Safe-to-display view of a key — never carries `hashed_secret` (KAN-30's admin list needs exactly this shape). */
export interface ApiKeySummary {
  id: string;
  name: string;
  environmentId: string;
  keyPrefix: string;
  scopes: readonly ApiKeyScope[];
  createdBy: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

function toSummary(apiKey: ApiKeyModel): ApiKeySummary {
  return {
    id: apiKey.id,
    name: apiKey.name,
    environmentId: apiKey.environment_id,
    keyPrefix: apiKey.key_prefix,
    scopes: apiKey.scopes,
    createdBy: apiKey.created_by,
    lastUsedAt: apiKey.last_used_at,
    revokedAt: apiKey.revoked_at,
  };
}

/** Every key (active or revoked) minted for one project, across all its environments — the admin-facing list. */
export async function listApiKeysForProject(organizationId: string, projectId: string): Promise<ApiKeySummary[]> {
  const apiKeys = await ApiKeyModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
  return apiKeys.map(toSummary);
}
