import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AdStudioBriefInput } from '@growthos/shared';
import {
  AdShareFeedbackInvalidError,
  AdShareProposalNotFoundError,
  AdStudioBriefNotFoundError,
  createAdShareFeedback,
  createAdShareLink,
  createAdStudioBrief,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  listAdShareFeedbackForLink,
  listAdShareFeedbackForProject,
  listAdShareProposals,
  resolveAdShareToken,
  saveAdShareProposals,
  updateAdShareFeedbackStatus,
  updateAdShareProposalOutcome,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';

beforeAll(async () => {
  await connectToFirestoreEmulator('ad-share-feedback-tests');
});

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

const INPUT: AdStudioBriefInput = {
  name: 'Summer Launch',
  objective: 'Leads',
  productDescription: 'Cloud invoicing software',
  landingPageUrl: 'https://acme.example.com',
  format: 'vertical',
  language: 'en',
  targetSeconds: 20,
};

async function setup() {
  const owner = await ensureUserForFirebaseSession({
    firebaseUid: unique('uid'),
    email: `${unique('owner')}@example.com`,
  });
  const { organization } = await createOrganizationWithOwner({ name: 'Agency Org', ownerUserId: owner.id });
  const { project } = await createProject({ organizationId: organization.id, name: 'Acme Client' });
  const brief = await createAdStudioBrief({
    organizationId: organization.id,
    projectId: project.id,
    input: INPUT,
    createdByUserId: owner.id,
  });
  return { ownerId: owner.id, orgId: organization.id, projectId: project.id, briefId: brief.id };
}

describe('ad share feedback & AI proposal persistence', () => {
  it('stores share link options, collects client feedback, and saves/updates AI proposals', async () => {
    const ctx = await setup();

    const { token, link } = await createAdShareLink({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      briefIds: [ctx.briefId],
      label: 'Maya at Acme',
      expiresInDays: 30,
      includeResults: true,
      allowFeedback: true,
      revisionNumber: 2,
      revisionNote: 'Updated opening hook per review',
      actorId: ctx.ownerId,
    });
    expect(link.revisionNumber).toBe(2);
    expect(link.revisionNote).toBe('Updated opening hook per review');
    expect(await resolveAdShareToken(token)).toMatchObject({
      label: 'Maya at Acme',
      includeResults: true,
      allowFeedback: true,
      revisionNumber: 2,
      revisionNote: 'Updated opening hook per review',
    });

    const fb1 = await createAdShareFeedback({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      shareLinkId: link.id,
      clientLabel: 'Maya at Acme',
      authorName: 'Maya',
      targetKind: 'brief',
      briefId: ctx.briefId,
      creativeRef: 'video',
      verdict: 'changes_requested',
      comment: 'Add free trial badge in scene 1',
      now: new Date('2026-11-18T10:00:00.000Z'),
    });
    expect(fb1.briefName).toBe('Summer Launch');
    expect(fb1.status).toBe('open');

    const fb2 = await createAdShareFeedback({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      shareLinkId: 'manual',
      authorName: 'Manager note',
      targetKind: 'general',
      verdict: 'request',
      comment: 'Please create a Search ad for Q4 promo',
      now: new Date('2026-11-18T10:05:00.000Z'),
    });

    const forLink = await listAdShareFeedbackForLink(ctx.orgId, ctx.projectId, link.id);
    expect(forLink.map((f) => f.id)).toEqual([fb1.id]);

    const allProject = await listAdShareFeedbackForProject(ctx.orgId, ctx.projectId);
    expect(allProject.map((f) => f.id)).toEqual([fb2.id, fb1.id]);

    const proposals = await saveAdShareProposals({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      actorId: ctx.ownerId,
      proposals: [
        {
          feedbackIds: [fb1.id],
          clientQuote: 'Add free trial badge in scene 1',
          kind: 'update_brief_settings',
          briefId: ctx.briefId,
          briefName: 'Summer Launch',
          title: 'Highlight 14-day free trial in brief & directions',
          summary: 'Update product description and video instructions to emphasize free trial.',
          rationale: 'Client specifically asked for trial visibility in opening scene.',
          changes: { videoInstructions: 'Highlight 14-day free trial clearly in opening visuals' },
        },
      ],
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.status).toBe('pending');

    const refreshedFeedback = await listAdShareFeedbackForProject(ctx.orgId, ctx.projectId);
    expect(refreshedFeedback.find((f) => f.id === fb1.id)?.status).toBe('proposed');

    const applied = await updateAdShareProposalOutcome({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      proposalId: proposals[0]!.id,
      status: 'applied',
      appliedBriefId: ctx.briefId,
      actorId: ctx.ownerId,
    });
    expect(applied.status).toBe('applied');
    expect(applied.appliedBriefId).toBe(ctx.briefId);

    const sent = await updateAdShareFeedbackStatus({
      organizationId: ctx.orgId,
      projectId: ctx.projectId,
      feedbackIds: [fb1.id],
      status: 'sent_to_client',
    });
    expect(sent[0]?.status).toBe('sent_to_client');
    expect((await listAdShareProposals(ctx.orgId, ctx.projectId))[0]?.status).toBe('applied');
  });

  it('rejects malformed feedback, missing brief, and unknown proposal id', async () => {
    const ctx = await setup();
    await expect(
      createAdShareFeedback({
        organizationId: ctx.orgId,
        projectId: ctx.projectId,
        shareLinkId: 'manual',
        targetKind: 'brief',
        briefId: ctx.briefId,
        verdict: 'changes_requested',
        comment: '   ',
      }),
    ).rejects.toBeInstanceOf(AdShareFeedbackInvalidError);

    await expect(
      createAdShareFeedback({
        organizationId: ctx.orgId,
        projectId: ctx.projectId,
        shareLinkId: 'manual',
        targetKind: 'brief',
        briefId: 'missing-brief',
        verdict: 'comment',
        comment: 'Nice',
      }),
    ).rejects.toBeInstanceOf(AdStudioBriefNotFoundError);

    await expect(
      updateAdShareProposalOutcome({
        organizationId: ctx.orgId,
        projectId: ctx.projectId,
        proposalId: 'missing-proposal',
        status: 'declined',
        actorId: ctx.ownerId,
      }),
    ).rejects.toBeInstanceOf(AdShareProposalNotFoundError);
  });
});
