import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { decryptSecret, encryptSecret } from '../vault/envelope';
import type { KmsProvider } from '../vault/kms-provider';
import { EnvironmentModel } from '../models/environment.model';
import { ProjectModel } from '../models/project.model';
import { IngestBatchModel } from '../models/ingest-batch.model';
import {
  BackfillEndpointModel,
  BackfillRequestModel,
  type BackfillSchemaRef,
  type BackfillStatus,
} from '../models/backfill.model';
import { isSchemaDefKind } from '../models/schema-def.model';
import { EnvironmentNotFoundError } from './key.service';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';
import { getActiveSchemaDefinition } from './schema-registry.service';

/**
 * Backfill (the integrator-resend loop): GrowthOS asks an integrator's endpoint to resend its
 * existing records, the integrator pages them through the normal ingest API tagged with
 * `X-GrowthOS-Backfill-Id`, then reports completion. The request is signed per Standard Webhooks
 * (`webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64 HMAC-SHA256 of "id.ts.body">`).
 */

export class InvalidBackfillEndpointError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid backfill endpoint: ${reasons.join('; ')}`);
    this.name = 'InvalidBackfillEndpointError';
  }
}

export class BackfillEndpointNotConfiguredError extends Error {
  constructor() {
    super('No backfill endpoint is registered for this environment. Register one first (set_backfill_endpoint).');
    this.name = 'BackfillEndpointNotConfiguredError';
  }
}

export class BackfillNotFoundError extends Error {
  constructor() {
    super('Backfill not found in this environment.');
    this.name = 'BackfillNotFoundError';
  }
}

export class BackfillAlreadyFinishedError extends Error {
  constructor(status: BackfillStatus) {
    super(`This backfill is already ${status}.`);
    this.name = 'BackfillAlreadyFinishedError';
  }
}

/** Secrets are issued in the `whsec_<base64>` form the Standard Webhooks libraries accept. */
export function generateBackfillSigningSecret(): string {
  return `whsec_${randomBytes(32).toString('base64')}`;
}

/** The HMAC key a secret stands for: the decoded bytes after `whsec_`, or the raw UTF-8 of any other string. */
function signingKeyBytes(secret: string): Buffer {
  return secret.startsWith('whsec_') ? Buffer.from(secret.slice('whsec_'.length), 'base64') : Buffer.from(secret, 'utf8');
}

export function signStandardWebhook(secret: string, webhookId: string, timestampSeconds: number, body: string): string {
  const signature = createHmac('sha256', signingKeyBytes(secret)).update(`${webhookId}.${timestampSeconds}.${body}`).digest('base64');
  return `v1,${signature}`;
}

/** Private, loopback, link-local (incl. cloud metadata), CGNAT and unspecified ranges - never a backfill target. */
export function isNonPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isNonPublicAddress(mapped[1]) : false;
  }
  return true;
}

export type HostResolver = (hostname: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address);

/**
 * GrowthOS calls this URL from its own servers, so it must not be steerable at internal services
 * (SSRF): https only, no credentials in the URL, and every address the host resolves to public.
 * Checked when the endpoint is registered and again before every delivery (DNS can change).
 */
export async function assertPublicHttpsUrl(rawUrl: string, resolver: HostResolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new InvalidBackfillEndpointError(['url is not a valid URL']);
  }
  const reasons: string[] = [];
  if (url.protocol !== 'https:') reasons.push('url must use https');
  if (url.username || url.password) reasons.push('url must not contain credentials');
  if (reasons.length === 0) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let addresses: string[] = [];
    try {
      addresses = isIP(host) ? [host] : await resolver(host);
    } catch {
      reasons.push(`url host ${host} does not resolve`);
    }
    if (addresses.length > 0 && addresses.some(isNonPublicAddress)) {
      reasons.push('url must resolve to a public address');
    }
  }
  if (reasons.length > 0) {
    throw new InvalidBackfillEndpointError(reasons);
  }
  return url;
}

async function requireEnvironment(organizationId: string, projectId: string, environmentId: string): Promise<void> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  const environment = await EnvironmentModel.init(environmentId, { organization_id: organizationId, project_id: projectId });
  if (!environment) {
    throw new EnvironmentNotFoundError();
  }
}

async function validateSchemas(organizationId: string, projectId: string, schemas: readonly { kind: string; name: string }[]): Promise<BackfillSchemaRef[]> {
  const reasons: string[] = [];
  const valid: BackfillSchemaRef[] = [];
  if (schemas.length === 0) reasons.push('schemas must list at least one schema');
  for (const schema of schemas) {
    const name = schema.name.trim();
    if (!isSchemaDefKind(schema.kind)) {
      reasons.push(`unknown schema kind "${schema.kind}"`);
      continue;
    }
    if (!(await getActiveSchemaDefinition(organizationId, projectId, schema.kind, name))) {
      reasons.push(`${schema.kind} schema "${name}" is not registered`);
      continue;
    }
    valid.push({ kind: schema.kind, name });
  }
  if (reasons.length > 0) {
    throw new InvalidBackfillEndpointError(reasons);
  }
  return valid;
}

function secretBindingId(organizationId: string, environmentId: string): string {
  return `backfill:${organizationId}:${environmentId}`;
}

export interface SetBackfillEndpointParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  url: string;
  schemas: readonly { kind: string; name: string }[];
  /** Issue a new signing secret for an existing endpoint. A new endpoint always gets one. */
  rotateSecret?: boolean;
  kms: KmsProvider;
  actedByUserId: string;
  resolver?: HostResolver;
}

export interface SetBackfillEndpointResult {
  endpoint: BackfillEndpointModel;
  /** Present only when a secret was issued (a new endpoint, or `rotateSecret`); never readable again. */
  signingSecret?: string;
}

export async function setBackfillEndpoint(params: SetBackfillEndpointParams): Promise<SetBackfillEndpointResult> {
  await requireEnvironment(params.organizationId, params.projectId, params.environmentId);
  const url = await assertPublicHttpsUrl(params.url, params.resolver);
  const schemas = await validateSchemas(params.organizationId, params.projectId, params.schemas);

  const existing = await BackfillEndpointModel.init(params.environmentId, { organization_id: params.organizationId, project_id: params.projectId });
  const now = new Date().toISOString();
  const endpoint = existing ?? new BackfillEndpointModel();
  const issueSecret = !existing || params.rotateSecret === true;
  const signingSecret = issueSecret ? generateBackfillSigningSecret() : undefined;

  endpoint.organization_id = params.organizationId;
  endpoint.project_id = params.projectId;
  endpoint.environment_id = params.environmentId;
  endpoint.url = url.toString();
  endpoint.schemas = schemas;
  if (signingSecret) {
    endpoint.signing_secret_encrypted = await encryptSecret(signingSecret, secretBindingId(params.organizationId, params.environmentId), params.kms);
  }
  if (!existing) {
    endpoint.created_by = params.actedByUserId;
    endpoint.registered_at = now;
  }
  endpoint.last_changed_at = now;
  endpoint.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  // One endpoint per environment: a new one is created under the environment id, an existing one updated in place.
  await (existing ? endpoint.save() : endpoint.save(params.environmentId));

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environmentId: params.environmentId,
      actorType: 'user',
      actorId: params.actedByUserId,
      action: existing ? 'backfill_endpoint.update' : 'backfill_endpoint.create',
      targetType: 'backfill_endpoint',
      targetId: params.environmentId,
      summary: `${existing ? 'Updated' : 'Registered'} the backfill endpoint ${endpoint.url}${signingSecret && existing ? ' and rotated its signing secret' : ''}`,
      after: { url: endpoint.url, schemas },
    });
  } catch {
    // Best-effort, like every other audit write: it never fails the change itself.
  }
  return { endpoint, ...(signingSecret ? { signingSecret } : {}) };
}

export async function getBackfillEndpoint(organizationId: string, projectId: string, environmentId: string): Promise<BackfillEndpointModel | null> {
  return BackfillEndpointModel.init(environmentId, { organization_id: organizationId, project_id: projectId });
}

export interface BackfillDeliveryRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Sends one delivery attempt; resolves with the HTTP status, rejects on a network error or timeout. */
export type BackfillTransport = (request: BackfillDeliveryRequest) => Promise<number>;

export const BACKFILL_DELIVERY_TIMEOUT_MS = 10_000;

const defaultTransport: BackfillTransport = async (request) => {
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(BACKFILL_DELIVERY_TIMEOUT_MS),
  });
  return response.status;
};

/**
 * Delays before each delivery attempt. Delivery runs inside the request that triggered it (the
 * button, or the request_backfill tool), so the schedule stays short enough to finish there.
 * Retries reuse the same `webhook-id`, so the endpoint can dedup them.
 */
export const BACKFILL_RETRY_DELAYS_MS = [0, 5_000, 15_000] as const;

export interface RequestBackfillParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  /** Defaults to every schema the endpoint was registered with. */
  schemas?: readonly { kind: string; name: string }[];
  requestedByUserId: string;
  kms: KmsProvider;
  transport?: BackfillTransport;
  resolver?: HostResolver;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export async function requestBackfill(params: RequestBackfillParams): Promise<BackfillRequestModel> {
  const endpoint = await getBackfillEndpoint(params.organizationId, params.projectId, params.environmentId);
  if (!endpoint) {
    throw new BackfillEndpointNotConfiguredError();
  }
  const schemas = params.schemas && params.schemas.length > 0 ? await validateSchemas(params.organizationId, params.projectId, params.schemas) : endpoint.schemas;
  const now = params.now ?? (() => new Date());
  const sleep = params.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const transport = params.transport ?? defaultTransport;
  const environment = await EnvironmentModel.init(params.environmentId, { organization_id: params.organizationId, project_id: params.projectId });

  const request = new BackfillRequestModel();
  request.organization_id = params.organizationId;
  request.project_id = params.projectId;
  request.environment_id = params.environmentId;
  request.schemas = schemas;
  request.status = 'requested';
  request.requested_by = params.requestedByUserId;
  request.requested_at = now().toISOString();
  request.webhook_id = `msg_${randomUUID()}`;
  request.delivery_attempts = 0;
  request.setPathParams({ organization_id: params.organizationId, project_id: params.projectId });
  await request.save();

  const body = JSON.stringify({
    type: 'backfill.requested',
    backfill_id: request.id,
    project_id: params.projectId,
    environment: environment?.name ?? params.environmentId,
    schemas,
    requested_at: request.requested_at,
  });
  const secret = await decryptSecret(endpoint.signing_secret_encrypted, secretBindingId(params.organizationId, params.environmentId), params.kms);

  let failureReason: string | undefined;
  for (const delay of BACKFILL_RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    request.delivery_attempts += 1;
    try {
      // Re-checked on every attempt: the host may have been re-pointed since registration.
      await assertPublicHttpsUrl(endpoint.url, params.resolver);
      const timestamp = Math.floor(now().getTime() / 1000);
      const status = await transport({
        url: endpoint.url,
        headers: {
          'content-type': 'application/json',
          'webhook-id': request.webhook_id,
          'webhook-timestamp': String(timestamp),
          'webhook-signature': signStandardWebhook(secret, request.webhook_id, timestamp, body),
        },
        body,
      });
      request.last_http_status = status;
      if (status >= 200 && status < 300) {
        request.status = 'delivered';
        request.delivered_at = now().toISOString();
        failureReason = undefined;
        break;
      }
      failureReason = `The endpoint answered HTTP ${status}.`;
      if (status < 500) break; // A 4xx is the endpoint refusing; retrying will not change that.
    } catch (error) {
      failureReason = error instanceof InvalidBackfillEndpointError ? error.message : `Delivery failed: ${error instanceof Error ? error.message : String(error)}`;
      if (error instanceof InvalidBackfillEndpointError) break;
    }
  }
  if (request.status !== 'delivered') {
    request.status = 'failed';
    request.failure_reason = failureReason ?? 'Delivery failed.';
  }
  await request.save();
  return request;
}

async function loadRequest(organizationId: string, projectId: string, environmentId: string | undefined, backfillId: string): Promise<BackfillRequestModel> {
  const request = await BackfillRequestModel.init(backfillId, { organization_id: organizationId, project_id: projectId });
  if (!request || (environmentId !== undefined && request.environment_id !== environmentId)) {
    throw new BackfillNotFoundError();
  }
  return request;
}

/**
 * Attributes an already-saved ingest batch to a backfill when the sender tagged it. Best-effort by
 * design: an unknown id, or one from another environment, leaves the batch untagged but ingested -
 * the tag must never cost data. Returns whether the batch was attributed.
 */
export async function attributeIngestBatchToBackfill(params: {
  organizationId: string;
  projectId: string;
  environmentId: string;
  batchId: string;
  backfillId: string;
}): Promise<boolean> {
  const request = await BackfillRequestModel.init(params.backfillId, { organization_id: params.organizationId, project_id: params.projectId });
  if (!request || request.environment_id !== params.environmentId) {
    return false;
  }
  const batch = await IngestBatchModel.init(params.batchId, { organization_id: params.organizationId, project_id: params.projectId });
  if (!batch) {
    return false;
  }
  batch.backfill_id = params.backfillId;
  await batch.save();
  if (request.status === 'requested' || request.status === 'delivered') {
    request.status = 'receiving';
    request.first_batch_at = new Date().toISOString();
    await request.save();
  }
  return true;
}

export interface CompleteBackfillParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  backfillId: string;
  status: 'completed' | 'failed';
  recordsSent: number;
  batches: number;
  errors?: { message: string }[];
}

export async function completeBackfill(params: CompleteBackfillParams): Promise<BackfillRequestModel> {
  const request = await loadRequest(params.organizationId, params.projectId, params.environmentId, params.backfillId);
  if (request.status === 'completed' || request.status === 'failed') {
    throw new BackfillAlreadyFinishedError(request.status);
  }
  request.status = params.status;
  request.completed_at = new Date().toISOString();
  request.report = {
    records_sent: params.recordsSent,
    batches: params.batches,
    ...(params.errors && params.errors.length > 0 ? { errors: params.errors.slice(0, 50) } : {}),
  };
  if (params.status === 'failed') {
    request.failure_reason = params.errors?.[0]?.message ?? 'The integrator reported the backfill as failed.';
  }
  await request.save();
  return request;
}

export interface BackfillProgress {
  batches: number;
  accepted: number;
  duplicates: number;
  quarantined: number;
}

export interface BackfillStatusView {
  backfillId: string;
  environmentId: string;
  status: BackfillStatus;
  schemas: BackfillSchemaRef[];
  requestedAt: string;
  deliveredAt?: string;
  firstBatchAt?: string;
  completedAt?: string;
  deliveryAttempts: number;
  lastHttpStatus?: number;
  failureReason?: string;
  report?: BackfillRequestModel['report'];
  /** Summed from the ingest batches tagged with this backfill's id. */
  progress: BackfillProgress;
}

async function progressFor(organizationId: string, projectId: string, backfillId: string): Promise<BackfillProgress> {
  const batches = await IngestBatchModel.initPath({ organization_id: organizationId, project_id: projectId }).where('backfill_id', '==', backfillId).get();
  return batches.reduce<BackfillProgress>(
    (sum, batch) => ({
      batches: sum.batches + 1,
      accepted: sum.accepted + batch.accepted_count,
      duplicates: sum.duplicates + batch.duplicate_count,
      quarantined: sum.quarantined + batch.quarantined_count,
    }),
    { batches: 0, accepted: 0, duplicates: 0, quarantined: 0 },
  );
}

function toStatusView(request: BackfillRequestModel, progress: BackfillProgress): BackfillStatusView {
  return {
    backfillId: request.id,
    environmentId: request.environment_id,
    status: request.status,
    schemas: request.schemas,
    requestedAt: request.requested_at,
    deliveryAttempts: request.delivery_attempts,
    progress,
    ...(request.delivered_at ? { deliveredAt: request.delivered_at } : {}),
    ...(request.first_batch_at ? { firstBatchAt: request.first_batch_at } : {}),
    ...(request.completed_at ? { completedAt: request.completed_at } : {}),
    ...(request.last_http_status !== undefined ? { lastHttpStatus: request.last_http_status } : {}),
    ...(request.failure_reason ? { failureReason: request.failure_reason } : {}),
    ...(request.report ? { report: request.report } : {}),
  };
}

export async function getBackfillStatus(organizationId: string, projectId: string, backfillId: string, environmentId?: string): Promise<BackfillStatusView> {
  const request = await loadRequest(organizationId, projectId, environmentId, backfillId);
  return toStatusView(request, await progressFor(organizationId, projectId, backfillId));
}

export const MAX_LISTED_BACKFILLS = 20;

/** The most recent backfills, newest first, optionally for one environment (filtered in memory: no composite index needed). */
export async function listBackfills(organizationId: string, projectId: string, environmentId?: string): Promise<BackfillStatusView[]> {
  const requests = await BackfillRequestModel.initPath({ organization_id: organizationId, project_id: projectId }).query().orderBy('requested_at', 'desc').limit(100).get();
  const inScope = requests.filter((request) => environmentId === undefined || request.environment_id === environmentId).slice(0, MAX_LISTED_BACKFILLS);
  return Promise.all(inScope.map(async (request) => toStatusView(request, await progressFor(organizationId, projectId, request.id))));
}
