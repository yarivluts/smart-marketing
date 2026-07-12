import { randomUUID } from 'node:crypto';
import {
  ACTIVATION_EVENT_SCHEMA_KIND,
  ACTIVATION_EVENT_SCHEMA_NAME,
  ACTIVATION_SCHEMA_FIELDS,
  buildActivationEventPayload,
  type ActivationFunnelStep,
} from '@growthos/shared';
import type { EnvironmentModel } from '../models/environment.model';
import { OrganizationModel } from '../models/organization.model';
import { ProjectModel } from '../models/project.model';
import { createOrganizationWithOwner, createProject, listEnvironmentsForProject } from './organization.service';
import { DuplicateSchemaDefinitionError, getActiveSchemaDefinition, registerSchemaDefinition } from './schema-registry.service';
import { ingestBatch, type IngestBatchSummary } from './ingest.service';

/**
 * Our own internal "dogfood" org/project (KAN-70 AC: "our own GrowthOS project tracks activation of
 * design partners") — never customer-visible, never reachable through any admin form, identified by a
 * fixed slug so bootstrapping is idempotent the same way `getOnboardingState` idempotently finds-or-
 * creates its own singleton doc. Once bootstrapped it's just a regular org/project, so every existing
 * admin surface (ingest health, schema registry, boards) already works against it for free — no new
 * UI needed, same "reuse what exists" posture KAN-68's onboarding wizard took for its own screens.
 */
const INTERNAL_ANALYTICS_ORG_SLUG = 'growthos-internal';
const INTERNAL_ANALYTICS_ORG_NAME = 'GrowthOS Internal';
const INTERNAL_ANALYTICS_PROJECT_NAME = 'Product Analytics';
const INTERNAL_ANALYTICS_ENVIRONMENT_NAME = 'prod';

/**
 * Names the platform-staff user who owns our internal dogfood org — unset in every environment until a
 * human designates a real staff account (a `needs-human` step, see PROGRESS.md), so `recordActivation
 * Event` is a safe no-op until then. Same "config-gated, safe no-op absent config" posture KAN-20's
 * `initTelemetry()`/`initSentry()` established for `OTEL_EXPORTER_OTLP_ENDPOINT`/`SENTRY_DSN`.
 */
const OWNER_USER_ID_ENV_VAR = 'GROWTHOS_PRODUCT_ANALYTICS_OWNER_USER_ID';

export function getProductAnalyticsOwnerUserId(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[OWNER_USER_ID_ENV_VAR];
  return value && value.trim().length > 0 ? value.trim() : null;
}

export interface ProductAnalyticsProjectRef {
  organizationId: string;
  projectId: string;
  environmentId: string;
}

async function findInternalOrganization(): Promise<OrganizationModel | null> {
  const matches = await OrganizationModel.query().where('slug', '==', INTERNAL_ANALYTICS_ORG_SLUG).limit(1).get();
  return matches[0] ?? null;
}

async function findInternalProject(organizationId: string): Promise<ProjectModel | null> {
  const matches = await ProjectModel.initPath({ organization_id: organizationId })
    .where('organization_id', '==', organizationId)
    .where('name', '==', INTERNAL_ANALYTICS_PROJECT_NAME)
    .limit(1)
    .get();
  return matches[0] ?? null;
}

/** Idempotently registers the activation-event schema (v1), mirroring `ensureTouchpointSchemaRegistered`'s own "seed on demand, tolerate a concurrent winner" reasoning. */
async function ensureActivationSchemaRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<void> {
  const existing = await getActiveSchemaDefinition(
    organizationId,
    projectId,
    ACTIVATION_EVENT_SCHEMA_KIND,
    ACTIVATION_EVENT_SCHEMA_NAME,
  );
  if (existing) return;

  try {
    await registerSchemaDefinition({
      organizationId,
      projectId,
      kind: ACTIVATION_EVENT_SCHEMA_KIND,
      name: ACTIVATION_EVENT_SCHEMA_NAME,
      fields: ACTIVATION_SCHEMA_FIELDS.map((field) => ({
        name: field.name,
        type: field.type,
        isRequired: field.isRequired,
        isPii: field.isPii,
        isIdentityKey: field.isIdentityKey,
      })),
      createdByUserId,
    });
  } catch (err) {
    if (!(err instanceof DuplicateSchemaDefinitionError)) {
      throw err;
    }
    // A concurrent bootstrap won the race between our existence check and this call — treat it the
    // same as having found it already registered (same reasoning as ensureTouchpointSchemaRegistered).
  }
}

/**
 * Idempotently bootstraps our own internal dogfood org/project/environment and its activation-event
 * schema — the target every `recordActivationEvent` call lands in. Returns `null` when
 * `GROWTHOS_PRODUCT_ANALYTICS_OWNER_USER_ID` isn't configured, so the whole feature is a safe no-op
 * until a human designates a real staff account to own it. Doesn't check that the configured owner id
 * actually resolves to a `UserModel` — same accepted tradeoff `createOrganizationWithOwner` already
 * documents for `ownerUserId`.
 */
export async function ensureProductAnalyticsProject(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProductAnalyticsProjectRef | null> {
  const ownerUserId = getProductAnalyticsOwnerUserId(env);
  if (!ownerUserId) return null;

  let organization = await findInternalOrganization();
  if (!organization) {
    ({ organization } = await createOrganizationWithOwner({
      name: INTERNAL_ANALYTICS_ORG_NAME,
      ownerUserId,
      slug: INTERNAL_ANALYTICS_ORG_SLUG,
    }));
  }

  let project = await findInternalProject(organization.id);
  let environments: EnvironmentModel[];
  if (!project) {
    ({ project, environments } = await createProject({
      organizationId: organization.id,
      name: INTERNAL_ANALYTICS_PROJECT_NAME,
    }));
  } else {
    environments = await listEnvironmentsForProject(organization.id, project.id);
  }

  const environment = environments.find((e) => e.name === INTERNAL_ANALYTICS_ENVIRONMENT_NAME) ?? environments[0];
  if (!environment) {
    // Unreachable in practice — createProject always provisions all ENVIRONMENTS — but if a project
    // somehow ended up with none, there's nowhere to ingest into; the caller treats this like "unconfigured".
    return null;
  }

  await ensureActivationSchemaRegistered(organization.id, project.id, ownerUserId);

  return { organizationId: organization.id, projectId: project.id, environmentId: environment.id };
}

export interface RecordActivationEventParams {
  funnelStep: ActivationFunnelStep;
  /** The design partner's own org/project — *not* our internal analytics org/project, which this call lands in instead. */
  targetOrganizationId: string;
  targetProjectId: string;
  packKey?: string;
  sourceConnectionMethod?: string;
  funnelStepCount?: number;
}

/**
 * Dogfoods our own Ingest API (KAN-70 AC) — fires one activation-funnel event for a design partner's
 * onboarding-wizard progress through `ingestBatch`, the exact same service function `POST /v1/ingest/
 * events` calls, scoped to our own internal analytics project instead of a customer's. Best-effort:
 * swallows every failure (unconfigured owner, a transient Firestore error, a quarantined record) so a
 * broken or unconfigured dogfood pipeline can never turn a design partner's own onboarding action into
 * a failure for them — the same posture every `recordAuditLogEntry` call site already takes.
 */
export async function recordActivationEvent(params: RecordActivationEventParams): Promise<IngestBatchSummary | null> {
  try {
    const target = await ensureProductAnalyticsProject();
    if (!target) return null;

    const payload = buildActivationEventPayload({
      eventId: randomUUID(),
      ts: new Date().toISOString(),
      funnelStep: params.funnelStep,
      targetOrganizationId: params.targetOrganizationId,
      targetProjectId: params.targetProjectId,
      packKey: params.packKey,
      sourceConnectionMethod: params.sourceConnectionMethod,
      funnelStepCount: params.funnelStepCount,
    });

    return await ingestBatch({
      organizationId: target.organizationId,
      projectId: target.projectId,
      environmentId: target.environmentId,
      input: { kind: 'event', records: [payload] },
    });
  } catch {
    return null;
  }
}
