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

/** How long a just-rotated-out signing secret still verifies (see `HookEndpointModel.previous_signing_secret_encrypted`) — the same "named `_TTL_MS` constant, ISO-string expiry" convention `tv-pairing.service.ts` establishes. */
const SIGNING_SECRET_GRACE_TTL_MS = 24 * 60 * 60 * 1000;

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

interface HookEndpointDefinitionInput {
  name: string;
  signatureMode: HookSignatureMode;
  signatureHeaderName?: string;
}

interface ValidatedHookEndpointDefinition {
  name: string;
  signatureHeaderName?: string;
}

/**
 * Validates a hook endpoint's own editable definition — name and (when
 * `signatureMode` is `hmac_sha256`) signatureHeaderName — shared by
 * {@link createHookEndpoint} and {@link updateHookEndpoint} (KAN-123) so the
 * two can never validate a definition differently. `signatureMode` itself is
 * immutable once an endpoint exists (mirrors `updateFieldMapping`'s `kind`
 * immutability posture, KAN-121 — a different signature mode is a different
 * endpoint, not a correction), so it's supplied by each caller rather than
 * accepted as new user input on update.
 */
function validateHookEndpointDefinition(input: HookEndpointDefinitionInput): ValidatedHookEndpointDefinition {
  if (input.signatureMode === 'hmac_sha256' && !input.signatureHeaderName?.trim()) {
    throw new MissingSignatureHeaderNameError();
  }
  return {
    name: input.name,
    signatureHeaderName: input.signatureMode === 'hmac_sha256' ? input.signatureHeaderName!.trim() : undefined,
  };
}

/**
 * {@link updateHookEndpoint}'s own audit-log `before`/`after` shape — omits
 * `signatureHeaderName` entirely rather than setting it to `undefined` when
 * absent, since Firestore's `setDoc()` (which `recordAuditLogEntry` calls)
 * rejects an `undefined` field value outright.
 */
function describeHookEndpointDefinition(name: string, signatureHeaderName: string | undefined): Record<string, unknown> {
  return signatureHeaderName === undefined ? { name } : { name, signatureHeaderName };
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

  const validated = validateHookEndpointDefinition({
    name: params.name,
    signatureMode: params.signatureMode,
    signatureHeaderName: params.signatureHeaderName,
  });

  const endpoint = new HookEndpointModel();
  endpoint.name = validated.name;
  endpoint.organization_id = params.organizationId;
  endpoint.project_id = params.projectId;
  endpoint.environment_id = params.environmentId;
  endpoint.hook_id = randomBytes(HOOK_ID_BYTES).toString('base64url');
  endpoint.signature_mode = params.signatureMode;
  if (validated.signatureHeaderName !== undefined) {
    endpoint.signature_header_name = validated.signatureHeaderName;
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

export interface EnableHookEndpointParams {
  organizationId: string;
  projectId: string;
  hookEndpointId: string;
  enabledByUserId: string;
}

/**
 * Resumes a disabled endpoint's receive URL (the human-facing "Enable" counterpart {@link disableHookEndpoint}
 * never got — a mistakenly-disabled endpoint was previously stuck disabled forever, the only way back
 * being to delete-and-recreate it and lose its signing-secret history). Idempotent the same way
 * `disableHookEndpoint` is: enabling an already-enabled endpoint just clears already-empty fields and
 * logs again, rather than erroring — the "safe to retry" posture that function's own doc comment
 * establishes, kept symmetric here.
 */
export async function enableHookEndpoint(params: EnableHookEndpointParams): Promise<HookEndpointModel> {
  const endpoint = await loadHookEndpoint(params.organizationId, params.projectId, params.hookEndpointId);
  endpoint.disabled_at = null;
  endpoint.disabled_by = null;
  await endpoint.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: endpoint.environment_id,
      actorType: 'user',
      actorId: params.enabledByUserId,
      action: 'hook_endpoint.enable',
      targetType: 'hook_endpoint',
      targetId: endpoint.id,
      summary: `Enabled hook endpoint "${endpoint.name}"`,
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return endpoint;
}

export interface UpdateHookEndpointParams {
  organizationId: string;
  projectId: string;
  hookEndpointId: string;
  name: string;
  signatureHeaderName?: string;
  actorUserId: string;
}

/**
 * Edits an existing hook endpoint's own definition — name and (in
 * `hmac_sha256` mode) signatureHeaderName — always a full replace, never a
 * sparse patch, the same posture `updateFieldMapping` (KAN-121) and its own
 * sibling registries establish. `signatureMode`/`environmentId`/`hookId`
 * stay immutable: `hookId` is embedded in the endpoint's own public receive
 * URL, so recreating it would break the sending SaaS's already-configured
 * webhook — exactly the problem this story closes (previously the only way
 * to fix a typo'd name or a wrong signatureHeaderName provider guess was
 * delete-and-recreate, which loses that URL and any signing-secret
 * history). Reuses {@link validateHookEndpointDefinition} directly so
 * create and update can never validate a definition differently.
 */
export async function updateHookEndpoint(params: UpdateHookEndpointParams): Promise<HookEndpointModel> {
  const endpoint = await loadHookEndpoint(params.organizationId, params.projectId, params.hookEndpointId);

  const validated = validateHookEndpointDefinition({
    name: params.name,
    signatureMode: endpoint.signature_mode,
    signatureHeaderName: params.signatureHeaderName,
  });

  // `signatureHeaderName` is only ever set in `hmac_sha256` mode — omitted entirely (never an
  // explicit `undefined` value) for a `none`-mode endpoint, since Firestore's `setDoc()` rejects
  // an `undefined` field value outright and would otherwise silently drop this whole audit entry
  // (`recordAuditLogEntry`'s own call is best-effort/swallowed below).
  const before = describeHookEndpointDefinition(endpoint.name, endpoint.signature_header_name);

  endpoint.name = validated.name;
  if (endpoint.signature_mode === 'hmac_sha256') {
    endpoint.signature_header_name = validated.signatureHeaderName;
  }
  await endpoint.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: endpoint.environment_id,
      actorType: 'user',
      actorId: params.actorUserId,
      action: 'hook_endpoint.update',
      targetType: 'hook_endpoint',
      targetId: endpoint.id,
      summary: `Updated hook endpoint "${endpoint.name}" definition`,
      before,
      after: describeHookEndpointDefinition(endpoint.name, endpoint.signature_header_name),
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
 * Sets (or rotates) an `hmac_sha256` endpoint's signing secret (KAN-29
 * vault, same posture `setSharedCredentialSecret` establishes). A *rotation*
 * (a secret already existed) keeps the displaced secret verifiable for
 * `SIGNING_SECRET_GRACE_TTL_MS` — the sending SaaS keeps working with its
 * still-configured old value until the human updates it or the window
 * lapses, rather than every delivery failing signature verification the
 * instant the secret changes. The very first set (no prior secret) has
 * nothing to grace-period.
 */
export async function setHookEndpointSigningSecret(params: SetHookEndpointSigningSecretParams): Promise<HookEndpointModel> {
  const endpoint = await loadHookEndpoint(params.organizationId, params.projectId, params.hookEndpointId);
  if (endpoint.signature_mode !== 'hmac_sha256') {
    throw new HookEndpointNotHmacModeError();
  }
  if (endpoint.signing_secret_encrypted) {
    endpoint.previous_signing_secret_encrypted = endpoint.signing_secret_encrypted;
    endpoint.previous_signing_secret_expires_at = new Date(Date.now() + SIGNING_SECRET_GRACE_TTL_MS).toISOString();
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
    const bindingId = endpointBindingId(endpoint.organization_id, endpoint.id);
    const secret = await decryptSecret(endpoint.signing_secret_encrypted, bindingId, params.kms);
    const nowIso = new Date().toISOString();
    if (verifyGenericHmacSignature(params.rawBody, signatureHeaderValue, secret)) {
      signatureVerified = true;
      if (endpoint.previous_signing_secret_expires_at && endpoint.previous_signing_secret_expires_at <= nowIso) {
        // Opportunistic cleanup: the sending SaaS is verifying fine against the live secret again
        // (its own grace window has lapsed), so there's no reason to keep the displaced ciphertext
        // around any longer — best-effort, never fails the delivery itself.
        try {
          endpoint.previous_signing_secret_encrypted = null;
          endpoint.previous_signing_secret_expires_at = null;
          await endpoint.save();
        } catch {
          // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
        }
      }
    } else if (endpoint.previous_signing_secret_encrypted && endpoint.previous_signing_secret_expires_at && endpoint.previous_signing_secret_expires_at > nowIso) {
      // Rejected against the live secret — still within a rotation's grace window (see
      // `setHookEndpointSigningSecret`), so give the just-displaced secret one more try before
      // failing the delivery outright.
      const previousSecret = await decryptSecret(endpoint.previous_signing_secret_encrypted, bindingId, params.kms);
      if (verifyGenericHmacSignature(params.rawBody, signatureHeaderValue, previousSecret)) {
        signatureVerified = true;
      }
    }
    if (!signatureVerified) {
      return err('invalid_signature');
    }
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

/** A project-scoped hook delivery lookup, exported so `field-mapping.service.ts`'s test-run can prefill a sample payload from a real queued delivery (read-only — no status change) instead of requiring the caller to paste JSON by hand. */
export async function getHookDeliveryForProject(organizationId: string, projectId: string, hookDeliveryId: string): Promise<HookDeliveryModel> {
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
  const delivery = await getHookDeliveryForProject(params.organizationId, params.projectId, params.hookDeliveryId);
  delivery.status = params.status;
  delivery.reviewed_at = new Date().toISOString();
  delivery.reviewed_by = params.actedByUserId;
  await delivery.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: delivery.environment_id,
      actorType: 'user',
      actorId: params.actedByUserId,
      action: 'hook_delivery.status_set',
      targetType: 'hook_delivery',
      targetId: delivery.id,
      summary: `Marked hook delivery "${delivery.id}" as ${params.status}`,
      after: { status: params.status },
    });
  } catch {
    // Best-effort — see the equivalent comment in `key.service.ts`'s `mintApiKey`.
  }

  return delivery;
}
