import { ProjectModel } from '../models/project.model';
import { EnvironmentModel } from '../models/environment.model';
import { PluginInstallModel } from '../models/plugin-install.model';
import { PluginSourceRunModel } from '../models/plugin-source-run.model';
import { SharedCredentialModel } from '../models/shared-credential.model';
import type { KmsProvider } from '../vault';
import {
  STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  STRIPE_PLUGIN_ID,
  StripeHttpApiClient,
  StripeSourcePluginExecutor,
  ensureStripeCommerceSchemasRegistered,
  mapStripeWebhookEventToIngestInput,
  parseStripeCredentialSecret,
  verifyStripeWebhookSignature,
  StripeWebhookSignatureError,
  type StripeCredentialSecret,
  type StripeWebhookEvent,
} from '../plugin-runtime/stripe';
import type { SourcePluginExecutor } from '../plugin-runtime';
import { ProjectNotFoundError, listActiveAttachmentsForProject } from './resource-library.service';
import { EnvironmentNotFoundError } from './key.service';
import { getPluginInstall, PluginInstallNotFoundError } from './plugin-registry.service';
import { CredentialSecretNotSetError, revealSharedCredentialSecret } from './vault.service';
import { ingestBatch, type IngestBatchSummary } from './ingest.service';
import { triggerSourcePluginRun, type TriggerSourcePluginRunParams } from './plugin-runtime.service';

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
 * inventing a synthetic system actor.
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

export interface RunSourcePluginInstallParams extends TriggerSourcePluginRunParams {
  /** Required to resolve a Stripe credential — `getServerKmsProvider()` in `apps/web`. Ignored for any non-Stripe install (most callers never need it). */
  kms?: KmsProvider;
}

/**
 * The one seam a "Run now" click goes through, regardless of which plugin
 * is installed (KAN-49). For the built-in Stripe plugin, this resolves its
 * configured credential and builds a real {@link StripeSourcePluginExecutor}
 * against the live Stripe API — instead of `triggerSourcePluginRun`'s own
 * default (the KAN-47 toy counter executor) — and, when a human actually
 * triggered the run, idempotently registers this connector's commerce
 * schemas first (`ensureStripeCommerceSchemasRegistered`) so a project's
 * very first "Run now" doesn't quarantine everything for want of a
 * registered schema. Every other plugin type passes straight through to
 * `triggerSourcePluginRun` unchanged — this function is additive, not a
 * replacement for the generic runtime KAN-47 built.
 */
export async function runSourcePluginInstall(params: RunSourcePluginInstallParams): Promise<PluginSourceRunModel> {
  const install = await getPluginInstall(params.organizationId, params.projectId, params.installId);

  if (install && install.plugin_id === STRIPE_PLUGIN_ID && install.status === 'installed') {
    if (!params.kms) {
      throw new StripeCredentialConfigError('no KMS provider was supplied to resolve its credential');
    }
    const { apiSecretKey } = await resolveStripeCredentialSecret(params.organizationId, params.projectId, install, params.kms);
    const executor: SourcePluginExecutor = new StripeSourcePluginExecutor({ apiClient: new StripeHttpApiClient(apiSecretKey) });

    if (params.triggeredByUserId) {
      await ensureStripeCommerceSchemasRegistered(params.organizationId, params.projectId, params.triggeredByUserId);
    }

    return triggerSourcePluginRun({ ...params, executor, precomputedInstall: install });
  }

  // `install` is `null` for a genuinely nonexistent install (falls through to
  // triggerSourcePluginRun's own 404) — passing `undefined` there is exactly its own default.
  return triggerSourcePluginRun({ ...params, precomputedInstall: install ?? undefined });
}
