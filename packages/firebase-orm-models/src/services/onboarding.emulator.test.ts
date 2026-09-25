import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  completeOnboarding,
  confirmOnboardingFunnelSteps,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getConfirmedFunnelSteps,
  getOnboardingState,
  getOrCreateOnboardingState,
  InvalidFunnelDefinitionError,
  listAuditLogEntriesForOrg,
  listMetricDefinitionsForProject,
  listBoardsForProject,
  listOnboardingMetricPacks,
  listPluginInstallsForProject,
  markOnboardingSourceConnected,
  mintApiKey,
  previewProjectFunnel,
  proposeOnboardingFunnelSteps,
  registerSchemaDefinition,
  selectOnboardingMetricPack,
  setProjectFunnel,
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
    expect(packs.map((pack) => pack.packKey).sort()).toEqual(['engagement', 'landing_page', 'saas_marketing']);
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
  });

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

  it('installing the Landing Page Performance pack provisions its metrics + board (KAN-79 follow-up: one-click, no YAML)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Onboarding Landing Page Org');

    const state = await selectOnboardingMetricPack({
      organizationId: organization.id,
      projectId: project.id,
      userId: owner.id,
      packKey: 'landing_page',
    });

    expect(state.selected_pack_key).toBe('landing_page');
    expect(state.selected_plugin_id).toBe('com.growthos.landing-page-pack');

    const defs = await listMetricDefinitionsForProject(organization.id, project.id);
    expect(defs.map((def) => def.name).sort()).toEqual(['lp_conversion_rate', 'lp_conversions', 'lp_visitors']);
    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards.map((board) => board.name)).toEqual(['Landing page performance']);
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

describe('previewProjectFunnel + setProjectFunnel (KAN-199)', () => {
  async function registerEvent(organizationId: string, projectId: string, userId: string, name: string, kind: 'event' | 'measure' = 'event') {
    await registerSchemaDefinition({
      organizationId,
      projectId,
      kind,
      name,
      fields: [{ name: 'plan', type: 'string', isRequired: false, isPii: false, isIdentityKey: false }],
      createdByUserId: userId,
    });
  }

  /** EasySign's own intended funnel — the integrator whose report this task came from. */
  const EASYSIGN_FUNNEL = ['touchpoint', 'signup', 'document_created', 'document_sent', 'document_signed'];

  async function setupEasySignProject(orgName: string) {
    const setup = await setupOrgWithProject(orgName);
    for (const name of EASYSIGN_FUNNEL) {
      await registerEvent(setup.organization.id, setup.project.id, setup.owner.id, name);
    }
    return setup;
  }

  it('previews the resolved funnel without writing anything', async () => {
    const { organization, project } = await setupEasySignProject('Funnel Preview Org');

    const preview = await previewProjectFunnel({
      organizationId: organization.id,
      projectId: project.id,
      steps: EASYSIGN_FUNNEL.map((eventSchemaName) => ({ eventSchemaName })),
    });

    expect(preview.steps.map((step) => step.eventSchemaName)).toEqual(EASYSIGN_FUNNEL);
    expect(preview.steps.map((step) => step.order)).toEqual([0, 1, 2, 3, 4]);
    // Stage keys are inferred by the wizard's own heuristic when not given.
    expect(preview.steps[1].stageKey).toBe('signup');
    expect(preview.previousSteps).toEqual([]);
    expect(preview.changed).toBe(true);
    expect(await getOnboardingState(organization.id, project.id)).toBeNull();
    expect(await getConfirmedFunnelSteps(organization.id, project.id)).toEqual([]);
  });

  it('stores the funnel in the same field the wizard writes, without advancing the wizard or claiming it was started', async () => {
    const { owner, organization, project } = await setupEasySignProject('Funnel Set Org');

    const result = await setProjectFunnel({
      organizationId: organization.id,
      projectId: project.id,
      actorType: 'api_key',
      actorId: 'key-123',
      steps: [{ eventSchemaName: 'touchpoint', stageKey: 'awareness' }, ...EASYSIGN_FUNNEL.slice(1).map((eventSchemaName) => ({ eventSchemaName }))],
    });
    expect(result.changed).toBe(true);

    const state = await getOnboardingState(organization.id, project.id);
    expect(state?.funnel_steps.map((step) => step.eventSchemaName)).toEqual(EASYSIGN_FUNNEL);
    expect(state?.funnel_steps[0]).toEqual({ eventSchemaName: 'touchpoint', stageKey: 'awareness', order: 0 });
    expect(state?.step).toBe('pack');
    expect(await getConfirmedFunnelSteps(organization.id, project.id)).toEqual(state?.funnel_steps);

    const entries = await listAuditLogEntriesForOrg(organization.id);
    const funnelEntry = entries.find((entry) => entry.action === 'funnel.set');
    expect(funnelEntry).toMatchObject({ actor_type: 'api_key', actor_id: 'key-123', project_id: project.id });
    expect(funnelEntry?.summary).toContain('touchpoint -> signup -> document_created -> document_sent -> document_signed');
    expect(funnelEntry?.before).toEqual({ steps: [] });
    // No human started the wizard, so neither must its start entry appear.
    expect(entries.some((entry) => entry.action === 'onboarding.start')).toBe(false);

    // Replacing it reports the previous funnel, and keeps the wizard's own progress untouched.
    await confirmOnboardingFunnelSteps({ organizationId: organization.id, projectId: project.id, userId: owner.id, steps: [] });
    const replaced = await setProjectFunnel({
      organizationId: organization.id,
      projectId: project.id,
      actorType: 'user',
      actorId: owner.id,
      steps: [{ eventSchemaName: 'signup' }, { eventSchemaName: 'document_signed' }],
    });
    expect(replaced.previousSteps).toEqual([]);
    const reread = await getOnboardingState(organization.id, project.id);
    expect(reread?.id).toBe(state?.id);
    expect(reread?.step).toBe('board');
    expect(reread?.funnel_steps.map((step) => step.eventSchemaName)).toEqual(['signup', 'document_signed']);
  });

  it('reports an unchanged funnel as changed: false', async () => {
    const { organization, project } = await setupEasySignProject('Funnel Unchanged Org');
    const steps = [{ eventSchemaName: 'signup' }, { eventSchemaName: 'document_signed' }];
    await setProjectFunnel({ organizationId: organization.id, projectId: project.id, actorType: 'user', actorId: 'u', steps });
    const again = await previewProjectFunnel({ organizationId: organization.id, projectId: project.id, steps });
    expect(again.changed).toBe(false);
    expect(again.previousSteps.map((step) => step.eventSchemaName)).toEqual(['signup', 'document_signed']);
  });

  it('refuses fewer than two steps', async () => {
    const { organization, project } = await setupEasySignProject('Funnel Too Few Org');
    await expect(previewProjectFunnel({ organizationId: organization.id, projectId: project.id, steps: [{ eventSchemaName: 'signup' }] })).rejects.toThrow(/at least 2 steps; got 1/);
    await expect(previewProjectFunnel({ organizationId: organization.id, projectId: project.id, steps: [] })).rejects.toBeInstanceOf(InvalidFunnelDefinitionError);
  });

  it('refuses a duplicate, an unknown name, a non-event schema and a bad stage key — every reason at once, with the accepted names', async () => {
    const { owner, organization, project } = await setupEasySignProject('Funnel Invalid Org');
    await registerEvent(organization.id, project.id, owner.id, 'mrr', 'measure');

    const error = await setProjectFunnel({
      organizationId: organization.id,
      projectId: project.id,
      actorType: 'user',
      actorId: owner.id,
      steps: [
        { eventSchemaName: 'signup' },
        { eventSchemaName: 'nope' },
        { eventSchemaName: 'signup' },
        { eventSchemaName: 'mrr' },
        { eventSchemaName: 'document_sent', stageKey: 'bogus' },
      ],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InvalidFunnelDefinitionError);
    const { reasons, availableEventSchemas } = error as InvalidFunnelDefinitionError;
    expect(reasons).toEqual([
      '"nope" is not a registered event schema in this project.',
      '"signup" appears more than once (steps 1 and 3); each event can be only one step.',
      '"mrr" is registered as a measure schema, not an event; a funnel step must be an event schema.',
      expect.stringContaining('stage key "bogus"'),
    ]);
    expect(availableEventSchemas).toEqual([...EASYSIGN_FUNNEL].sort());
    // Nothing was written.
    expect(await getOnboardingState(organization.id, project.id)).toBeNull();
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
