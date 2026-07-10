import { randomBytes } from 'node:crypto';
import { encryptSecret } from '../vault/envelope';
import type { KmsProvider } from '../vault/kms-provider';
import { HookEndpointModel, type HookSignatureMode } from '../models/hook-endpoint.model';
import { EnvironmentModel } from '../models/environment.model';
import { ProjectModel } from '../models/project.model';
import { ProjectNotFoundError } from './resource-library.service';
import { EnvironmentNotFoundError } from './key.service';
import { recordAuditLogEntry } from './audit-log.service';

export { EnvironmentNotFoundError } from './key.service';

export class HookEndpointNotFoundError extends Error {
  constructor() {
    super('Hook endpoint not found in this project.');
    this.name = 'HookEndpointNotFoundError';
  }
}

export class HmacSigningSecretRequiresKmsError extends Error {
  constructor() {
    super('An hmac_sha256 hook endpoint requires a KMS provider to encrypt its signing secret.');
    this.name = 'HmacSigningSecretRequiresKmsError';
  }
}

// 24 random bytes (base64url) — same entropy budget `key.service.ts` uses for API keys.
const SIGNING_SECRET_BYTES = 24;

/** The envelope's tenant-binding id: organization *and* hook endpoint, matching `SharedCredentialModel`'s reasoning in `vault.service.ts` — a bug that fed one endpoint's ciphertext into another's decrypt call fails closed instead of silently succeeding. */
export function hookEndpointSecretBindingId(organizationId: string, hookEndpointId: string): string {
  return `${organizationId}:${hookEndpointId}`;
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

async function loadHookEndpoint(organizationId: string, projectId: string, hookEndpointId: string): Promise<HookEndpointModel> {
  const hookEndpoint = await HookEndpointModel.init(hookEndpointId, { organization_id: organizationId, project_id: projectId });
  if (!hookEndpoint || hookEndpoint.organization_id !== organizationId || hookEndpoint.project_id !== projectId) {
    throw new HookEndpointNotFoundError();
  }
  return hookEndpoint;
}

export interface MintHookEndpointParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  name: string;
  signatureMode: HookSignatureMode;
  createdByUserId: string;
  /** Required when `signatureMode` is `hmac_sha256` — unused (and unrequired) for `none`. */
  kms?: KmsProvider;
}

export interface MintHookEndpointResult {
  hookEndpoint: HookEndpointModel;
  /**
   * The signing secret, only present for `hmac_sha256` endpoints. Like `mintApiKey`'s `rawKey`,
   * this is the caller's one chance to display it — `HookEndpointModel` only ever persists it
   * envelope-encrypted, and this codebase never decrypts a secret back out for browser display.
   */
  rawSigningSecret?: string;
}

/** Mints a new per-project inbound webhook endpoint (KAN-53). */
export async function mintHookEndpoint(params: MintHookEndpointParams): Promise<MintHookEndpointResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  await requireEnvironmentInProject(params.organizationId, params.projectId, params.environmentId);

  const hookEndpoint = new HookEndpointModel();
  hookEndpoint.name = params.name;
  hookEndpoint.organization_id = params.organizationId;
  hookEndpoint.project_id = params.projectId;
  hookEndpoint.environment_id = params.environmentId;
  hookEndpoint.signature_mode = params.signatureMode;
  hookEndpoint.created_by = params.createdByUserId;
  hookEndpoint.created_at = new Date().toISOString();
  hookEndpoint.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });

  let rawSigningSecret: string | undefined;
  if (params.signatureMode === 'hmac_sha256') {
    if (!params.kms) {
      throw new HmacSigningSecretRequiresKmsError();
    }
    rawSigningSecret = randomBytes(SIGNING_SECRET_BYTES).toString('base64url');
    // The envelope is bound to this endpoint's own id, which `hookEndpoint.id` only carries once
    // the ORM has assigned a document id — `save()` does that as a side effect for a new model.
    await hookEndpoint.save();
    hookEndpoint.encrypted_signing_secret = await encryptSecret(
      rawSigningSecret,
      hookEndpointSecretBindingId(params.organizationId, hookEndpoint.id),
      params.kms,
    );
  }
  await hookEndpoint.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: params.environmentId,
      actorType: 'user',
      actorId: params.createdByUserId,
      action: 'hook_endpoint.mint',
      targetType: 'hook_endpoint',
      targetId: hookEndpoint.id,
      summary: `Created hook endpoint "${hookEndpoint.name}" (${hookEndpoint.signature_mode})`,
      after: { name: hookEndpoint.name, environmentId: hookEndpoint.environment_id, signatureMode: hookEndpoint.signature_mode },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful mint into a failure for the caller.
  }

  return { hookEndpoint, rawSigningSecret };
}

/** Safe-to-display view of a hook endpoint — never carries `encrypted_signing_secret`. */
export interface HookEndpointSummary {
  id: string;
  name: string;
  environmentId: string;
  signatureMode: HookSignatureMode;
  createdBy: string;
  createdAt: string;
  revokedAt?: string;
}

function toSummary(hookEndpoint: HookEndpointModel): HookEndpointSummary {
  return {
    id: hookEndpoint.id,
    name: hookEndpoint.name,
    environmentId: hookEndpoint.environment_id,
    signatureMode: hookEndpoint.signature_mode,
    createdBy: hookEndpoint.created_by,
    createdAt: hookEndpoint.created_at,
    revokedAt: hookEndpoint.revoked_at,
  };
}

/** Every hook endpoint (active or revoked) created for one project, across all its environments — the admin-facing list, same posture as `listApiKeysForProject`. */
export async function listHookEndpointsForProject(organizationId: string, projectId: string): Promise<HookEndpointSummary[]> {
  const hookEndpoints = await HookEndpointModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
  return hookEndpoints.map(toSummary);
}

export interface RevokeHookEndpointParams {
  organizationId: string;
  projectId: string;
  hookEndpointId: string;
  revokedByUserId: string;
}

/** Revokes a hook endpoint immediately — idempotent, same "safe to retry" posture as `revokeApiKey`. */
export async function revokeHookEndpoint(params: RevokeHookEndpointParams): Promise<HookEndpointModel> {
  const hookEndpoint = await loadHookEndpoint(params.organizationId, params.projectId, params.hookEndpointId);
  hookEndpoint.revoked_at = new Date().toISOString();
  hookEndpoint.revoked_by = params.revokedByUserId;
  await hookEndpoint.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: hookEndpoint.environment_id,
      actorType: 'user',
      actorId: params.revokedByUserId,
      action: 'hook_endpoint.revoke',
      targetType: 'hook_endpoint',
      targetId: hookEndpoint.id,
      summary: `Revoked hook endpoint "${hookEndpoint.name}"`,
    });
  } catch {
    // Best-effort — see the comment in mintHookEndpoint above.
  }

  return hookEndpoint;
}

/**
 * Finds a live (non-revoked) hook endpoint purely by its id, scoped only by `projectId` — the
 * counterpart of `key.service.ts`'s `findLiveApiKeyByRawKey` for a caller (an external SaaS
 * webhook) that carries no org id of its own. `POST /v1/hooks/{project}/{hook_id}` only has
 * `project`+`hook_id` to go on, so this is a `hook_endpoints` collection-group query filtered
 * by `project_id`, matched against the requested id in-process — the same tradeoff
 * `findLiveApiKeyByRawKey` accepts, just keyed by a project-scoped id rather than a globally
 * unique secret hash.
 */
export async function findLiveHookEndpointForProject(projectId: string, hookEndpointId: string): Promise<HookEndpointModel | undefined> {
  const candidates = await HookEndpointModel.collectionQuery().where('project_id', '==', projectId).get();
  return candidates.find((candidate) => candidate.id === hookEndpointId && !candidate.revoked_at);
}
