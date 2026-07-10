import { ProjectModel } from '../models/project.model';
import { EnvironmentModel } from '../models/environment.model';
import { PluginInstallModel } from '../models/plugin-install.model';
import { SharedCredentialModel } from '../models/shared-credential.model';
import type { KmsProvider } from '../vault';
import {
  STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  STRIPE_PLUGIN_ID,
  mapStripeWebhookEventToIngestInput,
  parseStripeCredentialSecret,
  verifyStripeWebhookSignature,
  StripeWebhookSignatureError,
  type StripeCredentialSecret,
  type StripeWebhookEvent,
} from '../plugin-runtime/stripe';
import { ProjectNotFoundError, listActiveAttachmentsForProject } from './resource-library.service';
import { EnvironmentNotFoundError } from './key.service';
import { PluginInstallNotFoundError } from './plugin-registry.service';
import { CredentialSecretNotSetError, revealSharedCredentialSecret } from './vault.service';
import { ingestBatch, type IngestBatchSummary } from './ingest.service';

/** An install claims to be (or was resolved as) the built-in Stripe plugin, but isn't configured with a usable Stripe credential yet — surfaced identically whether the caller is a webhook delivery or a "Run now" click. */
export class StripeCredentialConfigError extends Error {
  constructor(public readonly reason: string) {
    super(`This install is not correctly configured to talk to Stripe yet: ${reason}`);
    this.name = 'StripeCredentialConfigError';
  }
}

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

async function requirePluginInstallInProject(organizationId: string, projectId: string, installId: string): Promise<PluginInstallModel> {
  const install = await PluginInstallModel.init(installId, { organization_id: organizationId, project_id: projectId });
  if (!install || install.organization_id !== organizationId || install.project_id !== projectId) {
    throw new PluginInstallNotFoundError();
  }
  return install;
}

/**
 * Resolves the Stripe secret (API key + webhook signing secret) an
 * install's `stripe_credential_attachment_id` config points at: an
 * *approved* `credential`-kind resource attachment (KAN-27) whose
 * `SharedCredentialModel.provider` is `'stripe'`, decrypted via the vault
 * (KAN-29). Every failure mode collapses to {@link StripeCredentialConfigError}
 * — from the caller's perspective (a webhook request, or a "Run now" click)
 * they're all the same story: "this install isn't correctly configured to
 * talk to Stripe yet." Exported so both {@link processStripeWebhookEvent} and
 * {@link runSourcePluginInstall} (a "Run now" click) share exactly one
 * credential-resolution path rather than two copies drifting apart.
 */
export async function resolveStripeCredentialSecret(
  organizationId: string,
  projectId: string,
  install: PluginInstallModel,
  kms: KmsProvider,
): Promise<StripeCredentialSecret> {
  const attachmentId = install.config[STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD];
  if (typeof attachmentId !== 'string' || attachmentId.trim().length === 0) {
    throw new StripeCredentialConfigError(`missing "${STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD}" config`);
  }

  const attachments = await listActiveAttachmentsForProject(organizationId, projectId);
  const attachment = attachments.find((entry) => entry.id === attachmentId && entry.resource_kind === 'credential');
  if (!attachment) {
    throw new StripeCredentialConfigError('no approved credential attachment matches the configured id');
  }

  const credential = await SharedCredentialModel.init(attachment.resource_id, { organization_id: organizationId });
  if (!credential || credential.provider !== 'stripe') {
    throw new StripeCredentialConfigError('the attached credential is not a Stripe credential');
  }

  try {
    const raw = await revealSharedCredentialSecret({ organizationId, credentialId: attachment.resource_id, kms });
    return parseStripeCredentialSecret(raw);
  } catch (error) {
    if (error instanceof CredentialSecretNotSetError) {
      throw new StripeCredentialConfigError('the attached Stripe credential has no secret set yet');
    }
    throw error;
  }
}

export interface ProcessStripeWebhookEventParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  installId: string;
  /** The exact, unmodified request body bytes as a string — signature verification is byte-sensitive (KAN-49). */
  rawBody: string;
  /** The `Stripe-Signature` request header, verbatim. */
  signatureHeader: string;
  kms: KmsProvider;
}

export interface ProcessStripeWebhookEventResult {
  eventId: string;
  eventType: string;
  /** `false` for an event type this connector doesn't map to a commerce schema — still a successful call, nothing to land. */
  handled: boolean;
  summary?: IngestBatchSummary;
}

/**
 * Verifies and lands one Stripe webhook delivery (KAN-49, plan `13 §E8.1`:
 * "webhooks"). Deliberately does **not** auto-register this connector's
 * commerce schemas the way {@link ensureStripeCommerceSchemasRegistered}
 * does for a human-triggered "Run now" (see {@link runSourcePluginInstall})
 * — `registerSchemaDefinition` always attributes its audit entry to a real
 * `actorType: 'user'`, and a webhook delivery has no human actor to
 * honestly attribute that to. A schema unregistered by the time a webhook
 * arrives lands the same honest `schema_not_registered` quarantine outcome
 * any other ingest path produces — the same "quarantine, don't fabricate"
 * posture this codebase already takes everywhere else, rather than
 * inventing a synthetic system actor. {@link runSourcePluginInstall} — the
 * "Run now" seam that does auto-register — now lives in
 * `source-plugin-dispatch.service.ts`, alongside the same seam's GA4 branch
 * (KAN-52).
 */
export async function processStripeWebhookEvent(params: ProcessStripeWebhookEventParams): Promise<ProcessStripeWebhookEventResult> {
  await requireProjectInOrg(params.organizationId, params.projectId);
  await requireEnvironmentInProject(params.organizationId, params.projectId, params.environmentId);
  const install = await requirePluginInstallInProject(params.organizationId, params.projectId, params.installId);

  if (install.status !== 'installed') {
    throw new StripeCredentialConfigError(`install status is "${install.status}", not "installed"`);
  }
  if (install.plugin_id !== STRIPE_PLUGIN_ID) {
    throw new StripeCredentialConfigError('this install is not the built-in Stripe plugin');
  }

  const { webhookSigningSecret } = await resolveStripeCredentialSecret(
    params.organizationId,
    params.projectId,
    install,
    params.kms,
  );

  verifyStripeWebhookSignature(params.rawBody, params.signatureHeader, webhookSigningSecret);

  // A real Stripe delivery whose signature just verified is guaranteed to be exactly what Stripe
  // sent — this only guards against a body that somehow isn't valid JSON despite that, so a
  // malformed payload maps to a clean 400 in the route rather than an unhandled 500.
  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(params.rawBody) as StripeWebhookEvent;
  } catch {
    throw new StripeWebhookSignatureError('payload is not valid JSON');
  }
  const input = mapStripeWebhookEventToIngestInput(event);
  if (!input) {
    return { eventId: event.id, eventType: event.type, handled: false };
  }

  const summary = await ingestBatch({
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: params.environmentId,
    input,
  });

  return { eventId: event.id, eventType: event.type, handled: true, summary };
}
