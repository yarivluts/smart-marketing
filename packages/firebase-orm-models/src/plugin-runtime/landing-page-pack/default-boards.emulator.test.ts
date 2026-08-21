import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOrganizationWithOwner, createProject, ensureUserForFirebaseSession, listBoardsForProject } from '../../index';
import { connectToFirestoreEmulator } from '../../test-utils/emulator';
import { ensureLandingPagePackDefaultBoardsSeeded, LANDING_PAGE_PACK_DEFAULT_BOARDS } from './default-boards';
import { ensureLandingPagePackRegistered } from './index';
import { LANDING_PAGE_PACK_PLUGIN_ID } from './manifest';

/** Emulator-backed tests for this pack's default-board seeding — mirrors the SaaS pack's own suite, over the shared `ensurePackDefaultBoardsSeeded` helper. */

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

describe('ensureLandingPagePackDefaultBoardsSeeded', () => {
  it("seeds the pack's default board, populated with its tiles, once the pack's metrics are registered", async () => {
    const { owner, organization, project } = await setupOrgWithProject('Default Boards Org');
    await ensureLandingPagePackRegistered(organization.id, project.id, owner.id);

    const result = await ensureLandingPagePackDefaultBoardsSeeded(organization.id, project.id, owner.id);
    expect(result.seeded).toEqual(['Landing page performance']);
    expect(result.alreadyPresent).toEqual([]);
    expect(result.repaired).toEqual([]);

    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards.map((board) => board.name)).toEqual(['Landing page performance']);
    expect(boards[0].tiles).toEqual(LANDING_PAGE_PACK_DEFAULT_BOARDS[0].tiles);
  });

  it('is idempotent: a second call seeds nothing new and creates no duplicate boards', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Idempotent Default Boards Org');
    await ensureLandingPagePackRegistered(organization.id, project.id, owner.id);
    await ensureLandingPagePackDefaultBoardsSeeded(organization.id, project.id, owner.id);

    const second = await ensureLandingPagePackDefaultBoardsSeeded(organization.id, project.id, owner.id);
    expect(second.seeded).toEqual([]);
    expect(second.alreadyPresent).toEqual(['Landing page performance']);

    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards).toHaveLength(1);
  });

  it('leaves a human-renamed-to-match board completely untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Pre-existing Board Org');
    await ensureLandingPagePackRegistered(organization.id, project.id, owner.id);

    const { createBoard } = await import('../../index');
    const preExisting = await createBoard({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Landing page performance',
      createdByUserId: owner.id,
    });

    const result = await ensureLandingPagePackDefaultBoardsSeeded(organization.id, project.id, owner.id);
    expect(result.alreadyPresent).toEqual(['Landing page performance']);
    expect(result.seeded).toEqual([]);

    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards[0].id).toBe(preExisting.id);
    expect(boards[0].tiles).toEqual([]); // left exactly as the human created it — no tiles clobbered in
  });

  it('repairs a board this pack itself created but never finished populating (an interrupted prior seed)', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Interrupted Seed Org');
    await ensureLandingPagePackRegistered(organization.id, project.id, owner.id);

    const { createBoard } = await import('../../index');
    const stuck = await createBoard({
      organizationId: organization.id,
      projectId: project.id,
      name: 'Landing page performance',
      createdByUserId: owner.id,
      seededByPluginId: LANDING_PAGE_PACK_PLUGIN_ID,
    });
    expect(stuck.tiles).toEqual([]);

    const result = await ensureLandingPagePackDefaultBoardsSeeded(organization.id, project.id, owner.id);
    expect(result.repaired).toEqual(['Landing page performance']);
    expect(result.seeded).toEqual([]);
    expect(result.alreadyPresent).toEqual([]);

    const boards = await listBoardsForProject(organization.id, project.id);
    expect(boards[0].id).toBe(stuck.id); // repaired in place, not recreated as a duplicate
    expect(boards[0].tiles).toEqual(LANDING_PAGE_PACK_DEFAULT_BOARDS[0].tiles);
  });

  it('is isolated per project: seeding in one project leaves a sibling project untouched', async () => {
    const { owner, organization, project } = await setupOrgWithProject('Isolation Boards Org');
    const { project: otherProject } = await createProject({ organizationId: organization.id, name: 'Other App' });
    await ensureLandingPagePackRegistered(organization.id, project.id, owner.id);

    await ensureLandingPagePackDefaultBoardsSeeded(organization.id, project.id, owner.id);

    const otherProjectBoards = await listBoardsForProject(organization.id, otherProject.id);
    expect(otherProjectBoards).toHaveLength(0);
  });
});
