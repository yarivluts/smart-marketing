import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  completeOnboarding,
  confirmOnboardingFunnelSteps,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getOnboardingState,
  getOrCreateOnboardingState,
  listMetricDefinitionsForProject,
  listBoardsForProject,
  listOnboardingMetricPacks,
  listPluginInstallsForProject,
  markOnboardingSourceConnected,
  mintApiKey,
  proposeOnboardingFunnelSteps,
  registerSchemaDefinition,
  selectOnboardingMetricPack,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('onboarding-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithProject(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project, environments } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project, environments };
}

describe('listOnboardingMetricPacks', () => {
  it('lists the built-in packs the wizard offers, without the "custom" escape hatch', () => {
    const packs = listOnboardingMetricPacks();
    expect(packs.map((pack) => pack.packKey).sort()).toEqual(['engagement', 'saas_marketing']);
  });
});

describe('getOrCreateOnboardingState', () => {
  it('creates a singleton "pack" step state on first visit, and returns the same doc on a second visit', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Onboarding Start Org');

    const first = await getOrCreateOnboardingState(organization.id, project.id, owner.id);
    expect(first.step).toBe('pack');
    expect(first.started_by).toBe(owner.id);
    expect(first.completed_at).toBeNull();

    const second = await getOrCreateOnboardingState(organization.id, project.id, owner.id);
    expect(second.id).toBe(first.id);

    const read = await getOnboardingState(organization.id, project.id);
    expect(read?.id).toBe(first.id);
  });

  it('getOnboardingState returns null before the wizard has ever been opened', async () => {
    const { organization, project } = await setupOrgWithProject('Onboarding Unstarted Org');
    expect(await getOnboardingState(organization.id, project.id)).toBeNull();
  });
});

describe('selectOnboardingMetricPack', () => {
  it('installing a built-in pack registers its manifest, installs it, provisions its metrics + starter boards, and advances the step', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Onboarding Pack Org');

    const state = await selectOnboardingMetricPack({
      organizationId: organization.id,
      projectId: project.id,
      userId: owner.id,
      packKey: 'saas_marketing',
    });

    expect(state.selected_pack_key).toBe('saas_marketing');
    expect(state.selected_plugin_id).toBe('com.growthos.saas-marketing-metrics');
    expect(state.step).toBe('sources');

    const installs = await listPluginInstallsForProject(organization.id, project.id);
    expect(installs.map((install) => install.plugin_id)).toContain('com.growthos.saas-marketing-metrics');

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs.map((def) => def.name)).toContain('ad_spend');

    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards.map((board) => board.name).sort()).toEqual(['Funnel', 'Marketing', 'Revenue / MRR']);
  }, 60_000); // the pack's own twenty-two sequential metric registrations, same timeout note as metric-pack-dispatch.emulator.test.ts

  it('is idempotent against a pack already installed (e.g. the wizard step retried)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Onboarding Pack Retry Org');

    await selectOnboardingMetricPack({ organizationId: organization.id, projectId: project.id, userId: owner.id, packKey: 'engagement' });
    const second = await selectOnboardingMetricPack({
      organizationId: organization.id,
      projectId: project.id,
      userId: owner.id,
      packKey: 'engagement',
    });

    expect(second.selected_pack_key).toBe('engagement');
    const installs = await listPluginInstallsForProject(organization.id, project.id);
    expect(installs.filter((install) => install.plugin_id === 'com.growthos.engagement-pack')).toHaveLength(1);
  });

  it('"custom" records the selection and advances the step without installing anything', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Onboarding Custom Org');

    const state = await selectOnboardingMetricPack({
      organizationId: organization.id,
      projectId: project.id,
      userId: owner.id,
      packKey: 'custom',
    });

    expect(state.selected_pack_key).toBe('custom');
    expect(state.selected_plugin_id).toBeNull();
    expect(state.step).toBe('sources');
    expect(await listPluginInstallsForProject(organization.id, project.id)).toHaveLength(0);
  });
});

describe('markOnboardingSourceConnected', () => {
  it('records a "push your own data" connection via a real ingest.write key mint', async () => {
    const { owner, organization, project, environments } = await setupOrgWithProject('Onboarding Source Org');
    const devEnv = environments.find((environment) => environment.name === 'dev');
    if (!devEnv) {
      throw new Error('expected a dev environment');
    }
    await mintApiKey({
      organizationId: organization.id,
      projectId: project.id,
      environmentId: devEnv.id,
      name: 'Website snippet',
      scopes: ['ingest.write'],
      createdByUserId: owner.id,
    });

    const state = await markOnboardingSourceConnected({
      organizationId: organization.id,
      projectId: project.id,
      userId: owner.id,
      method: 'push_your_own',
    });

    expect(state.source_connection_method).toBe('push_your_own');
    expect(state.connected_source_plugin_id).toBeNull();
    expect(state.step).toBe('funnel');
  });
});

describe('proposeOnboardingFunnelSteps + confirmOnboardingFunnelSteps', () => {
  it('proposes an ordered funnel from the project\'s active event schemas, and persists the human-confirmed order', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Onboarding Funnel Org');

    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'user_signed_up',
      fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });
    await registerSchemaDefinition({
      organizationId: organization.id,
      projectId: project.id,
      kind: 'event',
      name: 'order_placed',
      fields: [{ name: 'amount', type: 'number', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: owner.id,
    });

    const proposal = await proposeOnboardingFunnelSteps(organization.id, project.id);
    expect(proposal.map((step) => step.eventSchemaName)).toEqual(['user_signed_up', 'order_placed']);
    expect(proposal.map((step) => step.stageKey)).toEqual(['signup', 'conversion']);

    const state = await confirmOnboardingFunnelSteps({
      organizationId: organization.id,
      projectId: project.id,
      userId: owner.id,
      steps: proposal.map(({ eventSchemaName, stageKey, order }) => ({ eventSchemaName, stageKey, order })),
    });

    expect(state.funnel_steps).toEqual([
      { eventSchemaName: 'user_signed_up', stageKey: 'signup', order: 0 },
      { eventSchemaName: 'order_placed', stageKey: 'conversion', order: 1 },
    ]);
    expect(state.step).toBe('board');
  });

  it('returns an empty proposal for a project with no registered event schemas yet', async () => {
    const { organization, project } = await setupOrgWithProject('Onboarding No Schemas Org');
    expect(await proposeOnboardingFunnelSteps(organization.id, project.id)).toEqual([]);
  });
});

describe('completeOnboarding', () => {
  it('marks the wizard done and stamps completed_at', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Onboarding Complete Org');

    const state = await completeOnboarding({ organizationId: organization.id, projectId: project.id, userId: owner.id });

    expect(state.step).toBe('done');
    expect(state.completed_at).not.toBeNull();

    const reread = await getOnboardingState(organization.id, project.id);
    expect(reread?.step).toBe('done');
  });

  it('never regresses the step once a later one has been reached', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Onboarding No Regress Org');

    await confirmOnboardingFunnelSteps({ organizationId: organization.id, projectId: project.id, userId: owner.id, steps: [] });
    expect((await getOnboardingState(organization.id, project.id))?.step).toBe('board');

    // Re-submitting an earlier step (e.g. the human reopens the wizard and re-picks a pack) must not
    // walk `step` backwards past "board".
    await selectOnboardingMetricPack({ organizationId: organization.id, projectId: project.id, userId: owner.id, packKey: 'custom' });
    expect((await getOnboardingState(organization.id, project.id))?.step).toBe('board');
  });
});
