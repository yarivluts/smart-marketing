import { randomBytes } from 'node:crypto';
import { err, ok, type Result } from '@growthos/shared';
import { decryptSecret, encryptSecret } from '../vault/envelope';
import type { KmsProvider } from '../vault/kms-provider';
import { EnvironmentModel } from '../models/environment.model';
import { HookDeliveryModel, type HookDeliveryStatus } from '../models/hook-delivery.model';
import { HookEndpointModel, type HookSignatureMode } from '../models/hook-endpoint.model';
import { ProjectModel } from '../models/project.model';
import { EnvironmentNotFoundError } from './key.service';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { verifyGenericHmacSignature } from './hook-signature';

export class HookEndpointNotFoundError extends Error {
  constructor() {
    super('Hook endpoint not found in this project.');
    this.name = 'HookEndpointNotFoundError';
  }
}

export class MissingSignatureHeaderNameError extends Error {
  constructor() {
    super('A signature_header_name is required when signature_mode is "hmac_sha256".');
    this.name = 'MissingSignatureHeaderNameError';
  }
}

export class HookEndpointNotHmacModeError extends Error {
  constructor() {
    super('This hook endpoint is not in "hmac_sha256" signature mode.');
    this.name = 'HookEndpointNotHmacModeError';
  }
}

// 24 random bytes (base64url), the same entropy budget `key.service.ts` uses for API key
// secrets — comfortably unguessable for a token that (in `signature_mode: 'none'`) is the
// *entire* credential protecting this endpoint's receive URL.
const HOOK_ID_BYTES = 24;

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

async function requireEnvironmentInProject(organizationId: string, projectId: string, environmentId: string): Promise<EnvironmentModel> {
  const environment = await EnvironmentModel.init(environmentId, { organization_id: organizationId, project_id: projectId });
  if (!environment || environment.project_id !== projectId) {
    throw new EnvironmentNotFoundError();
  }
  return environment;
}

async function loadHookEndpoint(organizationId: string, projectId: string, hookEndpointId: string): Promise<HookEndpointModel> {
  const endpoint = await HookEndpointModel.init(hookEndpointId, { organization_id: organizationId, project_id: projectId });
  if (!endpoint || endpoint.organization_id !== organizationId || endpoint.project_id !== projectId) {
    throw new HookEndpointNotFoundError();
  }
  return endpoint;
}

/** The envelope's tenant-binding id — organization *and* endpoint, the same "bind to the specific record, not just its org" reasoning `vault.service.ts`'s `credentialBindingId` documents. */
function endpointBindingId(organizationId: string, hookEndpointId: string): string {
  return `${organizationId}:${hookEndpointId}`;
}

export interface CreateHookEndpointParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  name: string;
  signatureMode: HookSignatureMode;
  signatureHeaderName?: string;
  createdByUserId: string;
}

/**
 * Creates a new per-project+environment inbound webhook receiver (KAN-53).
 * When `signatureMode` is `'hmac_sha256'` the endpoint is created *without* a
 * secret yet — {@link setHookEndpointSigningSecret} sets it in a separate
 * call, the same create-then-set-secret split `createSharedCredential`/
 * `setSharedCredentialSecret` (KAN-27/29) already establishes, rather than
 * threading a KMS provider through the create path too. Until a secret is
 * set, every delivery to this endpoint fails signature verification
 * (`receiveHookPayload` treats a missing `signing_secret_encrypted` the same
 * as a bad signature) — safer than accepting unsigned payloads in the gap.
 */
export async function createHookEndpoint(params: CreateHookEndpointParams): Promise<HookEndpointModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  await requireEnvironmentInProject(params.organizationId, params.projectId, params.environmentId);

  if (params.signatureMode === 'hmac_sha256' && !params.signatureHeaderName?.trim()) {
    throw new MissingSignatureHeaderNameError();
  }

  const endpoint = new HookEndpointModel();
  endpoint.name = params.name;
  endpoint.organization_id = params.organizationId;
  endpoint.project_id = params.projectId;
  endpoint.environment_id = params.environmentId;
  endpoint.hook_id = randomBytes(HOOK_ID_BYTES).toString('base64url');
  endpoint.signature_mode = params.signatureMode;
  if (params.signatureMode === 'hmac_sha256') {
    endpoint.signature_header_name = params.signatureHeaderName!.trim();
  }
  endpoint.created_by = params.createdByUserId;
  endpoint.created_at = new Date().toISOString();
  endpoint.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await endpoint.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: params.environmentId,
      actorType: 'user',
      actorId: params.createdByUserId,
      action: 'hook_endpoint.create',
      targetType: 'hook_endpoint',
      targetId: endpoint.id,
      summary: `Created hook endpoint "${endpoint.name}" (${endpoint.signature_mode})`,
      after: { name: endpoint.name, environmentId: endpoint.environment_id, signatureMode: endpoint.signature_mode },
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return endpoint;
}

/** Every hook endpoint (active or disabled) ever created for one project, across all its environments — the admin-facing list. */
export async function listHookEndpointsForProject(organizationId: string, projectId: string): Promise<HookEndpointModel[]> {
  return HookEndpointModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
}

export interface DisableHookEndpointParams {
  organizationId: string;
  projectId: string;
  hookEndpointId: string;
  disabledByUserId: string;
}

/** Disables an endpoint's receive URL immediately (idempotent — re-disabling an already-disabled endpoint just refreshes `disabled_at`/`disabled_by`, the same "safe to retry" posture `revokeApiKey` establishes). */
export async function disableHookEndpoint(params: DisableHookEndpointParams): Promise<HookEndpointModel> {
  const endpoint = await loadHookEndpoint(params.organizationId, params.projectId, params.hookEndpointId);
  endpoint.disabled_at = new Date().toISOString();
  endpoint.disabled_by = params.disabledByUserId;
  await endpoint.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: endpoint.environment_id,
      actorType: 'user',
      actorId: params.disabledByUserId,
      action: 'hook_endpoint.disable',
      targetType: 'hook_endpoint',
      targetId: endpoint.id,
      summary: `Disabled hook endpoint "${endpoint.name}"`,
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return endpoint;
}

export interface SetHookEndpointSigningSecretParams {
  organizationId: string;
  projectId: string;
  hookEndpointId: string;
  signingSecret: string;
  kms: KmsProvider;
  actedByUserId: string;
}

/**
 * Sets (or rotates — same operation, overwriting whatever was there) an
 * `hmac_sha256` endpoint's signing secret (KAN-29 vault, same posture
 * `setSharedCredentialSecret` establishes). Callers must re-configure the
 * sending SaaS with the new value — there is no dual-secret grace window
 * (out of scope for KAN-53's buildable-today version).
 */
export async function setHookEndpointSigningSecret(params: SetHookEndpointSigningSecretParams): Promise<HookEndpointModel> {
  const endpoint = await loadHookEndpoint(params.organizationId, params.projectId, params.hookEndpointId);
  if (endpoint.signature_mode !== 'hmac_sha256') {
    throw new HookEndpointNotHmacModeError();
  }
  endpoint.signing_secret_encrypted = await encryptSecret(
    params.signingSecret,
    endpointBindingId(params.organizationId, endpoint.id),
    params.kms,
  );
  await endpoint.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: endpoint.environment_id,
      actorType: 'user',
      actorId: params.actedByUserId,
      action: 'hook_endpoint.set_secret',
      targetType: 'hook_endpoint',
      targetId: endpoint.id,
      summary: `Set signing secret for hook endpoint "${endpoint.name}"`,
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return endpoint;
}

export type ReceiveHookPayloadFailureReason = 'not_found' | 'invalid_signature';

export interface ReceiveHookPayloadParams {
  hookId: string;
  rawBody: string;
  headers: Record<string, string>;
  kms?: KmsProvider;
}

export interface ReceiveHookPayloadResult {
  delivery: HookDeliveryModel;
}

/** A curated, transport-layer-safe subset of headers worth keeping on the stored delivery — see `HookDeliveryModel`'s own doc comment for why the *full* header set is deliberately not captured. */
const DELIVERY_HEADER_ALLOWLIST = ['content-type', 'user-agent'];

function pickDeliveryHeaders(headers: Record<string, string>): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of DELIVERY_HEADER_ALLOWLIST) {
    const value = headers[name];
    if (value !== undefined) {
      picked[name] = value;
    }
  }
  return picked;
}

/**
 * Receives one inbound webhook delivery (KAN-53 AC: "store raw payload,
 * signature verification, review queue... unknown payloads visible in
 * queue, nothing lost"). Looked up purely by `hook_id` (a Firestore
 * collection-group query, the same pattern `findLiveApiKeyByRawKey`
 * establishes for API keys) since the receive URL carries no org/project
 * context of its own — that's the whole point of a single opaque token.
 *
 * An unknown or disabled `hook_id` and a live one whose signature check
 * fails both return `not_found`/`invalid_signature` *without* persisting
 * anything — those requests were never authenticated as belonging to this
 * endpoint at all, so there is nothing legitimate to keep; "nothing lost"
 * only promises durability for payloads that *did* pass authentication.
 */
export async function receiveHookPayload(params: ReceiveHookPayloadParams): Promise<Result<ReceiveHookPayloadResult, ReceiveHookPayloadFailureReason>> {
  const matches = await HookEndpointModel.collectionQuery().where('hook_id', '==', params.hookId).limit(1).get();
  const endpoint = matches[0];
  if (!endpoint || endpoint.disabled_at) {
    return err('not_found');
  }

  let signatureVerified = false;
  if (endpoint.signature_mode === 'hmac_sha256') {
    const headerName = endpoint.signature_header_name?.toLowerCase();
    const signatureHeaderValue = headerName ? params.headers[headerName] : undefined;
    if (!signatureHeaderValue || !endpoint.signing_secret_encrypted || !params.kms) {
      return err('invalid_signature');
    }
    const secret = await decryptSecret(endpoint.signing_secret_encrypted, endpointBindingId(endpoint.organization_id, endpoint.id), params.kms);
    if (!verifyGenericHmacSignature(params.rawBody, signatureHeaderValue, secret)) {
      return err('invalid_signature');
    }
    signatureVerified = true;
  }

  const delivery = new HookDeliveryModel();
  delivery.organization_id = endpoint.organization_id;
  delivery.project_id = endpoint.project_id;
  delivery.environment_id = endpoint.environment_id;
  delivery.hook_endpoint_id = endpoint.id;
  delivery.raw_payload = params.rawBody;
  delivery.headers = pickDeliveryHeaders(params.headers);
  delivery.signature_verified = signatureVerified;
  delivery.status = 'pending';
  delivery.received_at = new Date().toISOString();
  delivery.setPathParams({ organization_id: endpoint.organization_id, project_id: endpoint.project_id });
  await delivery.save();

  return ok({ delivery });
}

/** Every delivery (any status) landed for one project, across all its hook endpoints and environments — the review-queue admin list, newest first. */
export async function listHookDeliveriesForProject(organizationId: string, projectId: string): Promise<HookDeliveryModel[]> {
  const deliveries = await HookDeliveryModel.initPath({ organization_id: organizationId, project_id: projectId })
    .where('project_id', '==', projectId)
    .get();
  return [...deliveries].sort((a, b) => b.received_at.localeCompare(a.received_at));
}

export class HookDeliveryNotFoundError extends Error {
  constructor() {
    super('Hook delivery not found in this project.');
    this.name = 'HookDeliveryNotFoundError';
  }
}

async function loadHookDelivery(organizationId: string, projectId: string, hookDeliveryId: string): Promise<HookDeliveryModel> {
  const delivery = await HookDeliveryModel.init(hookDeliveryId, { organization_id: organizationId, project_id: projectId });
  if (!delivery || delivery.organization_id !== organizationId || delivery.project_id !== projectId) {
    throw new HookDeliveryNotFoundError();
  }
  return delivery;
}

export interface SetHookDeliveryStatusParams {
  organizationId: string;
  projectId: string;
  hookDeliveryId: string;
  status: Extract<HookDeliveryStatus, 'reviewed' | 'discarded'>;
  actedByUserId: string;
}

/** Marks a queued delivery `reviewed` or `discarded` — the human side of the review queue, since KAN-54's mapping engine doesn't exist yet to consume these automatically. */
export async function setHookDeliveryStatus(params: SetHookDeliveryStatusParams): Promise<HookDeliveryModel> {
  const delivery = await loadHookDelivery(params.organizationId, params.projectId, params.hookDeliveryId);
  delivery.status = params.status;
  delivery.reviewed_at = new Date().toISOString();
  delivery.reviewed_by = params.actedByUserId;
  await delivery.save();
  return delivery;
}
