import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, listBoardsForProject } from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import { ensureSaasMetricPackDefaultBoardsSeeded, SAAS_METRIC_PACK_DEFAULT_BOARDS } from './default-boards';
import { ensureSaasMetricPackRegistered } from './index';

/** Emulator-backed tests for KAN-61's default-board seeding. */

beforeAll(async () => {
  await connectToFirestoreEmulator('default-boards-tests');
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
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  return { owner, organization, project };
}

describe('ensureSaasMetricPackDefaultBoardsSeeded', () => {
  it('seeds all three default boards, populated with their tiles, once the pack\'s metrics are registered', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Default Boards Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const result = await ensureSaasMetricPackDefaultBoardsSeeded(organization.id, project.id, owner.id);
    expect(result.seeded).toEqual(['Marketing', 'Revenue / MRR', 'Funnel']);
    expect(result.alreadyPresent).toEqual([]);

    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards.map((board) => board.name).sort()).toEqual(['Funnel', 'Marketing', 'Revenue / MRR']);

    for (const defaultBoard of SAAS_METRIC_PACK_DEFAULT_BOARDS) {
      const saved = boards.find((board) => board.name === defaultBoard.name);
      expect(saved, `expected board "${defaultBoard.name}" to exist`).toBeDefined();
      expect(saved?.tiles).toEqual(defaultBoard.tiles);
    }
  }, 60_000); // pack registration (17 metrics) + 3 board creates + 3 tile saves — see saas-metric-pack.emulator.test.ts's own timeout note

  it('is idempotent: a second call seeds nothing new and creates no duplicate boards', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Default Boards Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);
    await ensureSaasMetricPackDefaultBoardsSeeded(organization.id, project.id, owner.id);

    const second = await ensureSaasMetricPackDefaultBoardsSeeded(organization.id, project.id, owner.id);
    expect(second.seeded).toEqual([]);
    expect(second.alreadyPresent).toEqual(['Marketing', 'Revenue / MRR', 'Funnel']);

    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards).toHaveLength(3);
  }, 60_000);

  it('leaves a human-renamed-to-match board completely untouched, and still seeds the other two', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Pre-existing Board Org');
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    const { createBoard } = await import('../../index');
    const preExisting = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Marketing', createdByUserId: owner.id });

    const result = await ensureSaasMetricPackDefaultBoardsSeeded(organization.id, project.id, owner.id);
    expect(result.alreadyPresent).toEqual(['Marketing']);
    expect(result.seeded).toEqual(['Revenue / MRR', 'Funnel']);

    const boards = await listBoardsForProject(organization.id, project.id);
    const marketing = boards.find((board) => board.name === 'Marketing');
    expect(marketing?.id).toBe(preExisting.id);
    expect(marketing?.tiles).toEqual([]); // left exactly as the human created it — no tiles clobbered in
  }, 60_000);

  it('is isolated per project: seeding in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Boards Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });
    await ensureSaasMetricPackRegistered(organization.id, project.id, owner.id);

    await ensureSaasMetricPackDefaultBoardsSeeded(organization.id, project.id, owner.id);

    const otherProjectBoards = await listBoardsForProject(organization.id, otherProject.id);
    expect(otherProjectBoards).toHaveLength(0);
  }, 60_000);
});
