import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  claimTvPairing,
  createBoard,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  getTvPairingStatus,
  InvalidTvPairingError,
  listTvPairingsForProject,
  ProjectNotFoundError,
  requestTvPairing,
  requireClaimedTvPairing,
  revokeTvPairing,
  TvPairingModel,
  TvPairingNotFoundError,
  updateTvPairingSettings,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('tv-pairing-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function uniqueEmail(prefix: string): string {
  return `${unique(prefix)}@example.com`;
}

async function setupOrgWithProjectAndBoard(orgName: string) {
  const owner = await ensureUserForFirebaseSession({ firebaseUid: unique('firebase-uid'), email: uniqueEmail('owner') });
  const { organization } = await createOrganizationWithOwner({ name: orgName, ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Website' });
  const board = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'War room', createdByUserId: owner.id });
  return { owner, organization, project, board };
}

describe('tv-pairing.service (KAN-67)', () => {
  it('a fresh pairing is pending, unclaimed, and never leaks org/project scope', async () => {
    const { deviceToken, code, codeExpiresAt } = await requestTvPairing();
    expect(deviceToken.length).toBeGreaterThan(20);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(new Date(codeExpiresAt).getTime()).toBeGreaterThan(Date.now());

    const status = await getTvPairingStatus(deviceToken);
    expect(status).toEqual({ status: 'pending', codeExpiresAt });

    const claimResult = await requireClaimedTvPairing(deviceToken);
    expect(claimResult.ok).toBe(false);
  });

  it('an unknown device token is invalid, not merely "pending"', async () => {
    const status = await getTvPairingStatus('this-token-was-never-minted');
    expect(status).toEqual({ status: 'invalid' });

    const result = await requireClaimedTvPairing('this-token-was-never-minted');
    expect(result.ok).toBe(false);
  });

  it('claiming with a valid code scopes the pairing to one org/project and its chosen boards', async () => {
    const { owner, organization, project, board } = await setupOrgWithProjectAndBoard('TV pairing org (claim)');
    const { deviceToken, code } = await requestTvPairing();

    const claimed = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 20,
      reducedMotion: false,
      label: 'Office lobby',
      claimedByUserId: owner.id,
    });
    expect(claimed.claimed).toBe(true);
    expect(claimed.organization_id).toBe(organization.id);
    expect(claimed.board_ids).toEqual([board.id]);

    const status = await getTvPairingStatus(deviceToken);
    expect(status).toEqual({
      status: 'claimed',
      organizationId: organization.id,
      projectId: project.id,
      boardIds: [board.id],
      rotationSeconds: 20,
      reducedMotion: false,
      label: 'Office lobby',
    });

    const live = await requireClaimedTvPairing(deviceToken);
    expect(live.ok).toBe(true);
    if (live.ok) {
      expect(live.value.id).toBe(claimed.id);
    }
  });

  it('a code is single-use — claiming it twice fails the second time', async () => {
    const { owner, organization, project, board } = await setupOrgWithProjectAndBoard('TV pairing org (single-use)');
    const { code } = await requestTvPairing();

    await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 15,
      reducedMotion: false,
      label: 'First claim',
      claimedByUserId: owner.id,
    });

    await expect(
      claimTvPairing({
        organizationId: organization.id,
        projectId: project.id,
        code,
        boardIds: [board.id],
        rotationSeconds: 15,
        reducedMotion: false,
        label: 'Second claim',
        claimedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidTvPairingError);
  });

  it('claiming with an unknown code fails', async () => {
    const { owner, organization, project, board } = await setupOrgWithProjectAndBoard('TV pairing org (bad code)');
    await expect(
      claimTvPairing({
        organizationId: organization.id,
        projectId: project.id,
        code: 'ZZZZZZ',
        boardIds: [board.id],
        rotationSeconds: 15,
        reducedMotion: false,
        label: 'Nope',
        claimedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidTvPairingError);
  });

  it('claiming a board id that does not belong to the project fails, collecting every reason', async () => {
    const { owner, organization, project } = await setupOrgWithProjectAndBoard('TV pairing org (bad board)');
    const { code } = await requestTvPairing();

    await expect(
      claimTvPairing({
        organizationId: organization.id,
        projectId: project.id,
        code,
        boardIds: ['does-not-exist-board'],
        rotationSeconds: 15,
        reducedMotion: false,
        label: 'Bad board',
        claimedByUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidTvPairingError);
  });

  it('claiming against a nonexistent project throws ProjectNotFoundError before ever touching the code', async () => {
    const { owner, organization } = await setupOrgWithProjectAndBoard('TV pairing org (bad project)');
    const { code } = await requestTvPairing();

    await expect(
      claimTvPairing({
        organizationId: organization.id,
        projectId: 'does-not-exist-project',
        code,
        boardIds: [],
        rotationSeconds: 15,
        reducedMotion: false,
        label: 'Bad project',
        claimedByUserId: owner.id,
      }),
    ).rejects.toThrow(ProjectNotFoundError);
  });

  it('an expired (never-claimed) code is reported as expired, not pending or invalid', async () => {
    const { deviceToken, pairingId } = await requestTvPairing();
    const pairing = await TvPairingModel.init(pairingId);
    expect(pairing).not.toBeNull();
    pairing!.code_expires_at = new Date(Date.now() - 1000).toISOString();
    await pairing!.save();

    const status = await getTvPairingStatus(deviceToken);
    expect(status).toEqual({ status: 'expired' });
  });

  it('revoking a claimed pairing takes effect immediately for both status checks and the viewer guard', async () => {
    const { owner, organization, project, board } = await setupOrgWithProjectAndBoard('TV pairing org (revoke)');
    const { deviceToken, code } = await requestTvPairing();
    const claimed = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 15,
      reducedMotion: true,
      label: 'To be revoked',
      claimedByUserId: owner.id,
    });

    const revoked = await revokeTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      pairingId: claimed.id,
      revokedByUserId: owner.id,
    });
    expect(revoked.revoked_at).toBeDefined();

    expect(await getTvPairingStatus(deviceToken)).toEqual({ status: 'revoked' });
    const result = await requireClaimedTvPairing(deviceToken);
    expect(result.ok).toBe(false);
  });

  it('revoking a pairing that does not belong to this org/project throws TvPairingNotFoundError', async () => {
    const { owner, organization, project, board } = await setupOrgWithProjectAndBoard('TV pairing org (revoke isolation A)');
    const { organization: otherOrg, project: otherProject } = await setupOrgWithProjectAndBoard('TV pairing org (revoke isolation B)');
    const { code } = await requestTvPairing();
    const claimed = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 15,
      reducedMotion: false,
      label: 'Org A TV',
      claimedByUserId: owner.id,
    });

    await expect(
      revokeTvPairing({ organizationId: otherOrg.id, projectId: otherProject.id, pairingId: claimed.id, revokedByUserId: owner.id }),
    ).rejects.toThrow(TvPairingNotFoundError);
  });

  it('listTvPairingsForProject only returns pairings claimed for that exact org/project, newest-claim-first', async () => {
    const { owner, organization, project, board } = await setupOrgWithProjectAndBoard('TV pairing org (list)');
    const { organization: otherOrg, project: otherProject, board: otherBoard } = await setupOrgWithProjectAndBoard('TV pairing org (list, other)');

    const first = await requestTvPairing();
    await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code: first.code,
      boardIds: [board.id],
      rotationSeconds: 10,
      reducedMotion: false,
      label: 'First TV',
      claimedByUserId: owner.id,
    });

    const second = await requestTvPairing();
    const secondClaimed = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code: second.code,
      boardIds: [board.id],
      rotationSeconds: 10,
      reducedMotion: false,
      label: 'Second TV',
      claimedByUserId: owner.id,
    });

    const otherOrgPairing = await requestTvPairing();
    await claimTvPairing({
      organizationId: otherOrg.id,
      projectId: otherProject.id,
      code: otherOrgPairing.code,
      boardIds: [otherBoard.id],
      rotationSeconds: 10,
      reducedMotion: false,
      label: 'Other org TV',
      claimedByUserId: owner.id,
    });

    const list = await listTvPairingsForProject(organization.id, project.id);
    expect(list.map((pairing) => pairing.label).sort()).toEqual(['First TV', 'Second TV']);
    expect(list[0].id).toBe(secondClaimed.id);
  });
});

describe('updateTvPairingSettings (KAN-127)', () => {
  it('replaces label/boardIds/rotationSeconds/reducedMotion, persisted to Firestore, structural fields untouched', async () => {
    const { owner, organization, project, board } = await setupOrgWithProjectAndBoard('TV settings edit org (happy path)');
    const secondBoard = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Second board', createdByUserId: owner.id });
    const { code } = await requestTvPairing();
    const claimed = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 20,
      reducedMotion: false,
      label: 'Original label',
      claimedByUserId: owner.id,
    });

    const updated = await updateTvPairingSettings({
      organizationId: organization.id,
      projectId: project.id,
      pairingId: claimed.id,
      label: 'Updated label',
      boardIds: [secondBoard.id],
      rotationSeconds: 45,
      reducedMotion: true,
      actorUserId: owner.id,
    });

    expect(updated.label).toBe('Updated label');
    expect(updated.board_ids).toEqual([secondBoard.id]);
    expect(updated.rotation_seconds).toBe(45);
    expect(updated.reduced_motion).toBe(true);
    // Structural/identity fields stay untouched by a settings edit.
    expect(updated.id).toBe(claimed.id);
    expect(updated.device_token_hash).toBe(claimed.device_token_hash);
    expect(updated.code_hash).toBe(claimed.code_hash);
    expect(updated.claimed).toBe(true);
    expect(updated.claimed_at).toBe(claimed.claimed_at);
    expect(updated.claimed_by).toBe(claimed.claimed_by);
    expect(updated.organization_id).toBe(organization.id);
    expect(updated.project_id).toBe(project.id);

    const [reloaded] = (await listTvPairingsForProject(organization.id, project.id)).filter((pairing) => pairing.id === claimed.id);
    expect(reloaded.label).toBe('Updated label');
    expect(reloaded.board_ids).toEqual([secondBoard.id]);
  });

  it('rejects an empty board list, an out-of-range rotation, and an empty label, collecting every reason', async () => {
    const { owner, organization, project, board } = await setupOrgWithProjectAndBoard('TV settings edit org (invalid fields)');
    const { code } = await requestTvPairing();
    const claimed = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 20,
      reducedMotion: false,
      label: 'Original label',
      claimedByUserId: owner.id,
    });

    await expect(
      updateTvPairingSettings({
        organizationId: organization.id,
        projectId: project.id,
        pairingId: claimed.id,
        label: '   ',
        boardIds: [],
        rotationSeconds: 999,
        reducedMotion: false,
        actorUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidTvPairingError);
  });

  it('rejects a board id that does not belong to the project', async () => {
    const { owner, organization, project, board } = await setupOrgWithProjectAndBoard('TV settings edit org (bad board)');
    const { code } = await requestTvPairing();
    const claimed = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 20,
      reducedMotion: false,
      label: 'Original label',
      claimedByUserId: owner.id,
    });

    await expect(
      updateTvPairingSettings({
        organizationId: organization.id,
        projectId: project.id,
        pairingId: claimed.id,
        label: 'Original label',
        boardIds: ['does-not-exist-board'],
        rotationSeconds: 20,
        reducedMotion: false,
        actorUserId: owner.id,
      }),
    ).rejects.toThrow(InvalidTvPairingError);

    const [reloaded] = (await listTvPairingsForProject(organization.id, project.id)).filter((pairing) => pairing.id === claimed.id);
    expect(reloaded.board_ids).toEqual([board.id]);
  });

  it('throws TvPairingNotFoundError for a pairing that does not belong to this org/project', async () => {
    const { owner, organization, project, board } = await setupOrgWithProjectAndBoard('TV settings edit org (isolation A)');
    const { organization: otherOrg, project: otherProject, board: otherBoard } = await setupOrgWithProjectAndBoard('TV settings edit org (isolation B)');
    const { code } = await requestTvPairing();
    const claimed = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 20,
      reducedMotion: false,
      label: 'Org A TV',
      claimedByUserId: owner.id,
    });

    await expect(
      updateTvPairingSettings({
        organizationId: otherOrg.id,
        projectId: otherProject.id,
        pairingId: claimed.id,
        label: 'Hijacked label',
        boardIds: [otherBoard.id],
        rotationSeconds: 20,
        reducedMotion: false,
        actorUserId: owner.id,
      }),
    ).rejects.toThrow(TvPairingNotFoundError);
  });

  it('an updated board list is reflected in a subsequent status poll', async () => {
    const { owner, organization, project, board } = await setupOrgWithProjectAndBoard('TV settings edit org (status poll)');
    const secondBoard = await createBoard({ organizationId: organization.id, projectId: project.id, name: 'Second board', createdByUserId: owner.id });
    const { deviceToken, code } = await requestTvPairing();
    const claimed = await claimTvPairing({
      organizationId: organization.id,
      projectId: project.id,
      code,
      boardIds: [board.id],
      rotationSeconds: 20,
      reducedMotion: false,
      label: 'Rotating TV',
      claimedByUserId: owner.id,
    });

    await updateTvPairingSettings({
      organizationId: organization.id,
      projectId: project.id,
      pairingId: claimed.id,
      label: 'Rotating TV',
      boardIds: [board.id, secondBoard.id],
      rotationSeconds: 60,
      reducedMotion: true,
      actorUserId: owner.id,
    });

    const status = await getTvPairingStatus(deviceToken);
    expect(status).toEqual({
      status: 'claimed',
      organizationId: organization.id,
      projectId: project.id,
      boardIds: [board.id, secondBoard.id],
      rotationSeconds: 60,
      reducedMotion: true,
      label: 'Rotating TV',
    });
  });
});
