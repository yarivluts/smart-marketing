import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SetupHealthReport, SetupRequirementId } from '@growthos/shared';
import {
  collectSetupObservations,
  createOrganizationWithOwner,
  createProject,
  dismissQuarantinedRecord,
  ensureUserForFirebaseSession,
  evaluateProjectSetupHealth,
  ingestBatch,
  listQuarantinedRecordsForProject,
  ProjectNotFoundError,
  registerSchemaDefinition,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

/**
 * KAN-197 B1 against real ingest: every status below comes from records pushed through
 * `ingestBatch` (accepted ones land as raw records, rejected ones in quarantine), never from a
 * flag. The predecessor tool derived "verified" from a list a human (or its own
 * verify_installation tool) ticked, so a requirement could read connected with no data at all.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('setup-health-service-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

async function setupProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: `${unique('owner')}@example.com` });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  const byName = (name: string) => environments.find((environment) => environment.name === name)!;
  const register = (kind: 'event' | 'entity' | 'measure', name: string, fields: string[] = []) =>
    registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind,
      name,
      fields: fields.map((field) => ({ name: field, type: 'string' as const, isRequired: false, isPii: false, isIdentityKey: false })),
      createdByUserId: owner.id,
    });
  return { owner, organization, project, dev: byName('dev'), staging: byName('staging'), prod: byName('prod'), register };
}

function statuses(report: SetupHealthReport, environmentName: string): Record<SetupRequirementId, string> {
  const environment = report.environments.find((candidate) => candidate.environmentName === environmentName)!;
  return Object.fromEntries(environment.requirements.map((result) => [result.requirementId, result.status])) as Record<SetupRequirementId, string>;
}

function event(name: string, properties: Record<string, unknown> = {}) {
  return { event_id: unique('evt'), event: name, ts: '2026-09-25T10:00:00Z', properties };
}

describe('evaluateProjectSetupHealth (KAN-197)', () => {
  it('derives connected / error / gap from accepted and quarantined records, separately per environment', async () => {
    const { organization, project, dev, staging, prod, register } = await setupProject('Setup Health Org');
    await register('event', 'touchpoint', ['utm_source', 'landing_page']);
    await register('event', 'signup', ['plan']);
    await register('event', 'document_created', ['document_id']);
    await register('entity', 'customer', ['plan']);
    const scope = { organizationId: organization.id, projectId: project.id };

    await ingestBatch({
      ...scope,
      environmentId: dev.id,
      input: { kind: 'event', records: [event('touchpoint', { utm_source: 'google' }), event('signup', { plan: 'free' }), event('document_created', { document_id: 'd1' })] },
    });
    await ingestBatch({ ...scope, environmentId: dev.id, input: { kind: 'entity', type: 'customer', records: [{ id: 'c1', attributes: { plan: 'free' } }] } });
    // Billing sent before its schema was registered: rejected into quarantine, never accepted.
    const rejected = await ingestBatch({ ...scope, environmentId: dev.id, input: { kind: 'event', records: [event('subscription_state_change', { status: 'active' })] } });
    expect(rejected.quarantined).toBe(1);

    const report = await evaluateProjectSetupHealth(scope);

    expect(statuses(report, 'dev')).toEqual({
      landing_page_attribution: 'connected',
      signups: 'connected',
      product_usage: 'connected',
      customer_profiles: 'connected',
      billing: 'error',
      ad_spend: 'gap',
    });
    // Registered project-wide, sent only to dev: staging and prod have received nothing.
    for (const environmentName of ['staging', 'prod']) {
      expect(new Set(Object.values(statuses(report, environmentName)))).toEqual(new Set(['gap']));
    }

    const devBilling = report.environments.find((environment) => environment.environmentId === dev.id)!.requirements.find((result) => result.requirementId === 'billing')!;
    expect(devBilling.quarantineReasons).toEqual(['schema_not_registered:subscription_state_change']);
    const prodSignups = report.environments.find((environment) => environment.environmentId === prod.id)!.requirements.find((result) => result.requirementId === 'signups')!;
    expect(prodSignups.silentRegisteredSchemas).toEqual(['signup']);

    expect(report.environments.map((environment) => environment.environmentId)).toEqual([dev.id, staging.id, prod.id]);
  });

  it('connects billing from subscription_state_change events alone - no Stripe (KAN-110)', async () => {
    const { organization, project, staging, register } = await setupProject('Setup Health Billing Org');
    await register('event', 'subscription_state_change', ['status', 'plan']);
    const scope = { organizationId: organization.id, projectId: project.id };
    await ingestBatch({ ...scope, environmentId: staging.id, input: { kind: 'event', records: [event('subscription_state_change', { status: 'active', plan: 'pro' })] } });

    const report = await evaluateProjectSetupHealth(scope);
    expect(statuses(report, 'staging').billing).toBe('connected');
    expect(statuses(report, 'prod').billing).toBe('gap');
  });

  it('a dismissed rejection is no longer an open problem, so the requirement falls back to a gap', async () => {
    const { owner, organization, project, dev } = await setupProject('Setup Health Dismiss Org');
    const scope = { organizationId: organization.id, projectId: project.id };
    await ingestBatch({ ...scope, environmentId: dev.id, input: { kind: 'measure', records: [{ measure: 'ad_spend', ts: '2026-09-25', value: 12, dimensions: {} }] } });
    expect(statuses(await evaluateProjectSetupHealth(scope), 'dev').ad_spend).toBe('error');

    const [open] = await listQuarantinedRecordsForProject(organization.id, project.id, undefined, dev.id);
    await dismissQuarantinedRecord(organization.id, project.id, open.id, owner.id);
    expect(statuses(await evaluateProjectSetupHealth(scope), 'dev').ad_spend).toBe('gap');
  });

  it("never counts another project's records, and restricts to one environment when asked", async () => {
    const a = await setupProject('Setup Health Isolation A');
    const b = await setupProject('Setup Health Isolation B');
    await a.register('event', 'signup', ['plan']);
    await b.register('event', 'signup', ['plan']);
    await ingestBatch({ organizationId: b.organization.id, projectId: b.project.id, environmentId: b.prod.id, input: { kind: 'event', records: [event('signup')] } });

    const report = await evaluateProjectSetupHealth({ organizationId: a.organization.id, projectId: a.project.id });
    expect(statuses(report, 'prod').signups).toBe('gap');

    const onlyProd = await collectSetupObservations({ organizationId: b.organization.id, projectId: b.project.id, environmentId: b.prod.id });
    expect(onlyProd.environments).toEqual([{ id: b.prod.id, name: 'prod' }]);
    expect(onlyProd.observations.find((observation) => observation.schemaName === 'signup')?.lastAcceptedAt).not.toBeNull();
  });

  it("refuses a project outside the caller's organization", async () => {
    const a = await setupProject('Setup Health Scope A');
    const b = await setupProject('Setup Health Scope B');
    await expect(evaluateProjectSetupHealth({ organizationId: a.organization.id, projectId: b.project.id })).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
