import { decryptSecret, type SecretEnvelope } from '../vault/envelope';
import type { KmsProvider } from '../vault/kms-provider';
import { verifyHookSignature } from '../hooks/hook-signature';
import { HookPayloadModel, type HookPayloadSignatureStatus } from '../models/hook-payload.model';
import type { HookSignatureMode } from '../models/hook-endpoint.model';
import { findLiveHookEndpointForProject, hookEndpointSecretBindingId, HookEndpointNotFoundError } from './hook-endpoint.service';
import { recordAuditLogEntry } from './audit-log.service';

export class HookPayloadNotFoundError extends Error {
  constructor() {
    super('Hook payload not found in this project.');
    this.name = 'HookPayloadNotFoundError';
  }
}

/** Same cap `listQuarantinedRecordsForProject`/`listRecentIngestBatchesForProject` use — bounds query cost until a real aggregation store exists. */
export const DEFAULT_HOOK_PAYLOAD_LIST_LIMIT = 200;

async function resolveSignatureStatus(
  signatureMode: HookSignatureMode,
  encryptedSigningSecret: SecretEnvelope | undefined,
  organizationId: string,
  hookEndpointId: string,
  rawBody: string,
  signatureHeaderValue: string | undefined,
  getKms: (() => KmsProvider) | undefined,
): Promise<HookPayloadSignatureStatus> {
  if (signatureMode === 'none') {
    return 'not_configured';
  }
  if (!signatureHeaderValue || !encryptedSigningSecret) {
    return 'missing';
  }
  if (!getKms) {
    // Defensive — a live hmac_sha256 endpoint always has a secret to check against, so a caller
    // that omitted a KMS provider entirely couldn't have verified it either way.
    return 'missing';
  }
  const secret = await decryptSecret(encryptedSigningSecret, hookEndpointSecretBindingId(organizationId, hookEndpointId), getKms());
  return verifyHookSignature(rawBody, signatureHeaderValue, secret) ? 'verified' : 'invalid';
}

export interface ReceiveHookPayloadParams {
  projectId: string;
  hookEndpointId: string;
  rawBody: string;
  headers: Record<string, string>;
  signatureHeaderValue?: string;
  /**
   * Lazily constructs the KMS provider, only invoked when the resolved hook endpoint actually
   * needs one (`signature_mode: 'hmac_sha256'`) — so a `none`-mode endpoint (the zero-config
   * default) keeps working even before KAN-18 provisions a real vault-backed KMS.
   */
  getKms?: () => KmsProvider;
}

/**
 * Receives one inbound webhook request (KAN-53): resolves its `HookEndpointModel` purely from
 * the URL's `{project}/{hook_id}`, checks its signature if configured, and — regardless of the
 * outcome — durably persists the raw request as a `HookPayloadModel` in the review queue. There
 * is no mapping engine yet (KAN-54), so every payload is "unknown" by definition and always
 * lands `pending_review`; a bad/missing signature is recorded on the row for a human to see, not
 * grounds to drop the request (KAN-53 AC: "nothing lost").
 */
export async function receiveHookPayload(params: ReceiveHookPayloadParams): Promise<HookPayloadModel> {
  const hookEndpoint = await findLiveHookEndpointForProject(params.projectId, params.hookEndpointId);
  if (!hookEndpoint) {
    throw new HookEndpointNotFoundError();
  }

  const signatureStatus = await resolveSignatureStatus(
    hookEndpoint.signature_mode,
    hookEndpoint.encrypted_signing_secret,
    hookEndpoint.organization_id,
    hookEndpoint.id,
    params.rawBody,
    params.signatureHeaderValue,
    params.getKms,
  );

  const payload = new HookPayloadModel();
  payload.organization_id = hookEndpoint.organization_id;
  payload.project_id = hookEndpoint.project_id;
  payload.environment_id = hookEndpoint.environment_id;
  payload.hook_endpoint_id = hookEndpoint.id;
  payload.headers = params.headers;
  payload.raw_body = params.rawBody;
  payload.signature_status = signatureStatus;
  payload.status = 'pending_review';
  payload.received_at = new Date().toISOString();
  payload.setPathParams({ organization_id: hookEndpoint.organization_id, project_id: hookEndpoint.project_id });
  await payload.save();

  return payload;
}

/** The most recent pending-review hook payloads for a project, newest first — the review-queue browser. */
export async function listHookPayloadsForProject(
  organizationId: string,
  projectId: string,
  limit: number = DEFAULT_HOOK_PAYLOAD_LIST_LIMIT,
): Promise<HookPayloadModel[]> {
  return HookPayloadModel.initPath({ organization_id: organizationId, project_id: projectId })
    .query()
    .where('status', '==', 'pending_review')
    .orderBy('received_at', 'desc')
    .limit(limit)
    .get();
}

export interface DismissHookPayloadParams {
  organizationId: string;
  projectId: string;
  hookPayloadId: string;
  reviewedByUserId: string;
}

/** Marks a review-queue payload reviewed with no further action — the only verb this story ships (KAN-54's mapping engine is what would add a "replay through a mapping" action on top of this queue, the same way KAN-34 sits on top of KAN-32's quarantine). Idempotent, same "safe to retry" posture as `revokeApiKey`/`revokeHookEndpoint`. */
export async function dismissHookPayload(params: DismissHookPayloadParams): Promise<HookPayloadModel> {
  const payload = await HookPayloadModel.init(params.hookPayloadId, {
    organization_id: params.organizationId,
    project_id: params.projectId,
  });
  if (!payload || payload.organization_id !== params.organizationId || payload.project_id !== params.projectId) {
    throw new HookPayloadNotFoundError();
  }

  payload.status = 'dismissed';
  payload.reviewed_at = new Date().toISOString();
  payload.reviewed_by = params.reviewedByUserId;
  await payload.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: payload.environment_id,
      actorType: 'user',
      actorId: params.reviewedByUserId,
      action: 'hook_payload.dismiss',
      targetType: 'hook_payload',
      targetId: payload.id,
      summary: `Dismissed hook payload from endpoint ${payload.hook_endpoint_id}`,
    });
  } catch {
    // Best-effort — see the comment on `recordAuditLogEntry`.
  }

  return payload;
}
