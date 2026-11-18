// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdShareFeedbackItem, AdShareProposalView } from '@growthos/shared';

const store = vi.hoisted(() => {
  const briefs = new Map<string, Record<string, unknown>>();
  const feedback: AdShareFeedbackItem[] = [];
  const proposals: AdShareProposalView[] = [];
  const runs: Record<string, unknown>[] = [];
  let seq = 1;

  return {
    briefs,
    feedback,
    proposals,
    runs,
    nextId: (prefix: string) => `${prefix}-${seq++}`,
    reset: () => {
      briefs.clear();
      feedback.length = 0;
      proposals.length = 0;
      runs.length = 0;
      seq = 1;
    },
  };
});

vi.mock('@growthos/firebase-orm-models', async () => {
  const actual = await vi.importActual<typeof import('@growthos/firebase-orm-models')>('@growthos/firebase-orm-models');
  return {
    ...actual,
    listAdShareFeedbackForProject: vi.fn(async () => [...store.feedback]),
    listAdShareProposals: vi.fn(async () => [...store.proposals]),
    listAdStudioBriefs: vi.fn(async () => [...store.briefs.values()]),
    getAdStudioBrandKit: vi.fn(async () => ({
      brandName: 'Acme Solar',
      slogan: 'Sun power every day',
      toneOfVoice: 'Direct and trustworthy',
      avoidWords: ['cheap'],
      colors: { primary: '#111111', accent: '#f59e0b' },
      logo: null,
      lastChangedOn: null,
    })),
    getAdStudioBrief: vi.fn(async (_o: string, _p: string, id: string) => {
      const b = store.briefs.get(id);
      if (!b) throw new Error(`Brief ${id} not found`);
      return b;
    }),
    updateAdStudioBriefDetails: vi.fn(async ({ briefId, input }: { briefId: string; input: Record<string, unknown> }) => {
      const b = store.briefs.get(briefId)!;
      b.name = input.name;
      b.objective = input.objective;
      b.product_description = input.productDescription;
      b.landing_page_url = input.landingPageUrl;
      b.video_format = input.format;
      b.language = input.language;
      b.target_seconds = input.targetSeconds;
      return b;
    }),
    saveAdStudioVideoSettings: vi.fn(async ({ briefId, settings }: { briefId: string; settings: Record<string, unknown> }) => {
      const b = store.briefs.get(briefId)!;
      b.video_settings = { ...((b.video_settings as Record<string, unknown>) ?? {}), ...settings };
      return b;
    }),
    saveAdStudioVoice: vi.fn(async ({ briefId, voice }: { briefId: string; voice: unknown }) => {
      const b = store.briefs.get(briefId)!;
      b.narrator_voice = voice;
      return b;
    }),
    saveAdStudioCopy: vi.fn(async ({ briefId, videoCopy }: { briefId: string; videoCopy?: unknown }) => {
      const b = store.briefs.get(briefId)!;
      if (videoCopy !== undefined) b.video_copy = videoCopy;
      return b;
    }),
    saveAdStudioScript: vi.fn(async ({ briefId, scenes }: { briefId: string; scenes: unknown[] }) => {
      const b = store.briefs.get(briefId)!;
      b.scenes = scenes;
      return b;
    }),
    saveAdStudioImageConcepts: vi.fn(async ({ briefId, concepts }: { briefId: string; concepts: unknown[] }) => {
      const b = store.briefs.get(briefId)!;
      b.image_concepts = concepts;
      return b;
    }),
    saveAdStudioSearchAd: vi.fn(async ({ briefId, ad }: { briefId: string; ad: unknown }) => {
      const b = store.briefs.get(briefId)!;
      b.search_ad = ad;
      return b;
    }),
    createAdStudioBrief: vi.fn(async ({ organizationId, projectId, input }: { organizationId: string; projectId: string; input: Record<string, unknown> }) => {
      const id = store.nextId('brief');
      const created = {
        id,
        organization_id: organizationId,
        project_id: projectId,
        name: input.name,
        objective: input.objective,
        product_description: input.productDescription,
        landing_page_url: input.landingPageUrl ?? null,
        video_format: input.format,
        language: input.language,
        target_seconds: input.targetSeconds,
        scenes: [],
        image_concepts: [],
      };
      store.briefs.set(id, created);
      return created;
    }),
    saveAdShareProposals: vi.fn(async ({ proposals }: { proposals: Array<Omit<AdShareProposalView, 'id' | 'status' | 'appliedBriefId' | 'runId' | 'failureReason' | 'createdOn' | 'decidedOn'>> }) => {
      const created: AdShareProposalView[] = proposals.map((p) => {
        const view: AdShareProposalView = {
          ...p,
          id: store.nextId('prop'),
          status: 'pending',
          appliedBriefId: null,
          runId: null,
          failureReason: null,
          createdOn: '2026-11-18T08:00:00.000Z',
          decidedOn: null,
        };
        store.proposals.push(view);
        for (const fb of store.feedback) {
          if (p.feedbackIds.includes(fb.id) && fb.status === 'open') fb.status = 'proposed';
        }
        return view;
      });
      return created;
    }),
    getAdShareProposal: vi.fn(async (_o: string, _p: string, proposalId: string) => {
      const p = store.proposals.find((item) => item.id === proposalId);
      if (!p) throw new Error(`Proposal ${proposalId} not found`);
      return {
        id: p.id,
        feedback_ids: p.feedbackIds,
        client_quote: p.clientQuote,
        kind: p.kind,
        brief_id: p.briefId,
        brief_name: p.briefName,
        title: p.title,
        summary: p.summary,
        rationale: p.rationale,
        changes: p.changes,
        status: p.status,
        applied_brief_id: p.appliedBriefId,
        run_id: p.runId,
        failure_reason: p.failureReason,
        created_on: p.createdOn,
        decided_on: p.decidedOn,
      };
    }),
    updateAdShareProposalOutcome: vi.fn(async ({ proposalId, status, appliedBriefId, runId, failureReason }: {
      proposalId: string;
      status: AdShareProposalView['status'];
      appliedBriefId?: string | null;
      runId?: string | null;
      failureReason?: string | null;
    }) => {
      const p = store.proposals.find((item) => item.id === proposalId)!;
      p.status = status;
      if (appliedBriefId !== undefined) p.appliedBriefId = appliedBriefId;
      if (runId !== undefined) p.runId = runId;
      if (failureReason !== undefined) p.failureReason = failureReason;
      p.decidedOn = '2026-11-18T08:05:00.000Z';
      return p;
    }),
    updateAdShareFeedbackStatus: vi.fn(async ({ feedbackIds, status }: { feedbackIds: readonly string[]; status: AdShareFeedbackItem['status'] }) => {
      for (const fb of store.feedback) {
        if (feedbackIds.includes(fb.id)) fb.status = status;
      }
      return store.feedback.filter((fb) => feedbackIds.includes(fb.id));
    }),
  };
});

vi.mock('./metering', () => ({
  meteredCall: vi.fn(async (_ctx: unknown, _kind: unknown, _briefId: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('./autopilot', () => ({
  startAdStudioAutopilot: vi.fn(async ({ briefId, options }: { briefId: string; options: Record<string, unknown> }) => {
    const run = { id: store.nextId('run'), brief_id: briefId, options, status: 'running' };
    store.runs.push(run);
    return run;
  }),
}));

import { decideClientProposal, proposeChangesFromClientFeedback } from './client-requests';
import { startAdStudioAutopilot } from './autopilot';
import type { AdStudioLlm } from './llm';

function seedBrief() {
  store.briefs.set('brief-1', {
    id: 'brief-1',
    organization_id: 'org-1',
    project_id: 'proj-1',
    name: 'Rooftop Solar Reel',
    objective: 'Book homeowner site assessments',
    product_description: 'Zero-down home solar panels',
    landing_page_url: 'https://acme-solar.example/home',
    video_format: 'vertical',
    language: 'he',
    target_seconds: 20,
    video_settings: { instructions: 'Israeli presenter in Tel Aviv daylight' },
    narrator_voice: { preset: 'woman_warm' },
    scenes: [
      { id: 'scene-1', durationSeconds: 5, visualPrompt: 'Solar panels on roof', voiceover: 'Save on electricity every month', onScreenText: 'Save on Solar' },
    ],
    image_concepts: [
      { id: 'concept-1', headline: 'Half off your power bill', visualPrompt: 'Bright rooftop solar installation', formats: ['square'] },
    ],
    search_ad: null,
  });
}

describe('client requests -> AI proposals & execution', () => {
  beforeEach(() => {
    store.reset();
    vi.clearAllMocks();
    seedBrief();
  });

  it('proposes concrete changes from open feedback while ignoring pure approvals', async () => {
    store.feedback.push(
      {
        id: 'fb-approved',
        shareLinkId: 'lnk-1',
        clientLabel: 'Acme',
        authorName: 'Dana',
        targetKind: 'brief',
        briefId: 'brief-1',
        briefName: 'Rooftop Solar Reel',
        creativeRef: null,
        campaignId: null,
        campaignLabel: null,
        verdict: 'approved',
        comment: 'Looks great!',
        status: 'open',
        createdOn: '2026-11-18T07:00:00.000Z',
        resolvedOn: null,
      },
      {
        id: 'fb-change',
        shareLinkId: 'lnk-1',
        clientLabel: 'Acme',
        authorName: 'Dana',
        targetKind: 'brief',
        briefId: 'brief-1',
        briefName: 'Rooftop Solar Reel',
        creativeRef: null,
        campaignId: null,
        campaignLabel: null,
        verdict: 'changes_requested',
        comment: 'Highlight the 25-year warranty and use an energetic male voice.',
        status: 'open',
        createdOn: '2026-11-18T07:05:00.000Z',
        resolvedOn: null,
      },
      {
        id: 'fb-new',
        shareLinkId: 'lnk-1',
        clientLabel: 'Acme',
        authorName: 'Dana',
        targetKind: 'general',
        briefId: null,
        briefName: null,
        creativeRef: null,
        campaignId: null,
        campaignLabel: null,
        verdict: 'request',
        comment: 'Please create a second campaign specifically for business owners with flat roofs.',
        status: 'open',
        createdOn: '2026-11-18T07:10:00.000Z',
        resolvedOn: null,
      },
    );

    const llm: AdStudioLlm = {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      generateJson: vi.fn(async () => ({
        proposals: [
          {
            feedbackIds: ['fb-change'],
            clientQuote: 'Highlight the 25-year warranty and use an energetic male voice.',
            kind: 'update_brief_settings',
            briefId: 'brief-1',
            title: 'Highlight 25-year warranty and energetic male voice',
            summary: 'Update video instructions for 25-year warranty and switch narrator.',
            rationale: 'Directly answers client note on the existing ad.',
            videoInstructions: 'Emphasize 25-year warranty badge cleanly, warm Israeli daylight.',
            voicePreset: 'man_energetic',
          },
          {
            feedbackIds: ['fb-new'],
            clientQuote: 'create a second campaign specifically for business owners with flat roofs',
            kind: 'create_new_brief',
            briefId: null,
            title: 'New brief for commercial flat-roof businesses',
            summary: 'Create dedicated ad for business customers.',
            rationale: 'Separating B2B messaging improves relevance.',
            name: 'Commercial Flat-Roof Solar',
            objective: 'Book commercial roof assessments',
            productDescription: 'High-efficiency flat-roof commercial solar systems',
            format: 'vertical',
            language: 'he',
            targetSeconds: 15,
          },
        ],
      })) as unknown as AdStudioLlm['generateJson'],
    };

    const result = await proposeChangesFromClientFeedback({
      organizationId: 'org-1',
      projectId: 'proj-1',
      actorId: 'mgr-1',
      llm,
      targetLocale: 'he',
    });

    expect(result.analyzedFeedbackCount).toBe(2);
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0]).toMatchObject({
      kind: 'update_brief_settings',
      briefId: 'brief-1',
      status: 'pending',
    });
    expect(result.proposals[1]).toMatchObject({
      kind: 'create_new_brief',
      briefId: null,
      changes: { name: 'Commercial Flat-Roof Solar', format: 'vertical' },
    });
    expect(store.feedback.find((f) => f.id === 'fb-approved')?.status).toBe('open');
    expect(store.feedback.find((f) => f.id === 'fb-change')?.status).toBe('proposed');
  });

  it('applies approved settings + creates new brief + updates image concepts + handles decline cleanly', async () => {
    store.feedback.push(
      {
        id: 'fb-1',
        shareLinkId: 'lnk-1',
        clientLabel: 'Acme',
        authorName: 'Dana',
        targetKind: 'brief',
        briefId: 'brief-1',
        briefName: 'Rooftop Solar Reel',
        creativeRef: null,
        campaignId: null,
        campaignLabel: null,
        verdict: 'changes_requested',
        comment: 'Use warmer headline and energetic male narrator.',
        status: 'proposed',
        createdOn: '2026-11-18T07:05:00.000Z',
        resolvedOn: null,
      },
      {
        id: 'fb-2',
        shareLinkId: 'lnk-1',
        clientLabel: 'Acme',
        authorName: 'Dana',
        targetKind: 'general',
        briefId: null,
        briefName: null,
        creativeRef: null,
        campaignId: null,
        campaignLabel: null,
        verdict: 'request',
        comment: 'New commercial brief',
        status: 'proposed',
        createdOn: '2026-11-18T07:10:00.000Z',
        resolvedOn: null,
      },
      {
        id: 'fb-3',
        shareLinkId: 'lnk-1',
        clientLabel: 'Acme',
        authorName: 'Dana',
        targetKind: 'brief',
        briefId: 'brief-1',
        briefName: 'Rooftop Solar Reel',
        creativeRef: null,
        campaignId: null,
        campaignLabel: null,
        verdict: 'comment',
        comment: 'Make image yellow background',
        status: 'proposed',
        createdOn: '2026-11-18T07:12:00.000Z',
        resolvedOn: null,
      },
    );

    store.proposals.push(
      {
        id: 'prop-settings',
        feedbackIds: ['fb-1'],
        clientQuote: 'Use energetic male narrator',
        kind: 'update_brief_settings',
        briefId: 'brief-1',
        briefName: 'Rooftop Solar Reel',
        title: 'Voice update',
        summary: 'Switch narrator voice',
        rationale: 'Matches client note',
        changes: { voicePreset: 'man_energetic', videoInstructions: 'Bright warm sunlight' },
        status: 'pending',
        appliedBriefId: null,
        runId: null,
        failureReason: null,
        createdOn: '2026-11-18T07:20:00.000Z',
        decidedOn: null,
      },
      {
        id: 'prop-create',
        feedbackIds: ['fb-2'],
        clientQuote: 'New commercial brief',
        kind: 'create_new_brief',
        briefId: null,
        briefName: null,
        title: 'Commercial brief',
        summary: 'Create new ad',
        rationale: 'Expand reach',
        changes: {
          name: 'Commercial Flat-Roof',
          objective: 'Book commercial calls',
          productDescription: 'Commercial solar panels',
          format: 'vertical',
          language: 'he',
          targetSeconds: 15,
        },
        status: 'pending',
        appliedBriefId: null,
        runId: null,
        failureReason: null,
        createdOn: '2026-11-18T07:21:00.000Z',
        decidedOn: null,
      },
      {
        id: 'prop-decline',
        feedbackIds: ['fb-3'],
        clientQuote: 'Make image yellow background',
        kind: 'update_image_concepts',
        briefId: 'brief-1',
        briefName: 'Rooftop Solar Reel',
        title: 'Yellow image',
        summary: 'Switch bg color',
        rationale: 'High contrast',
        changes: {
          mode: 'update_first',
          concepts: [{ headline: 'Save 50%', visualPrompt: 'Solar roof against bright sunset sky', formats: ['square'] }],
        },
        status: 'pending',
        appliedBriefId: null,
        runId: null,
        failureReason: null,
        createdOn: '2026-11-18T07:22:00.000Z',
        decidedOn: null,
      },
    );

    const resSettings = await decideClientProposal({
      organizationId: 'org-1',
      projectId: 'proj-1',
      proposalId: 'prop-settings',
      actorId: 'mgr-1',
      decision: 'approve',
    });
    expect(resSettings.proposal.status).toBe('applied');
    expect(resSettings.appliedBriefId).toBe('brief-1');
    expect(resSettings.run?.id).toBeTruthy();
    expect(store.briefs.get('brief-1')?.narrator_voice).toEqual({ preset: 'man_energetic' });
    expect(store.feedback.find((f) => f.id === 'fb-1')?.status).toBe('applied');

    const resCreate = await decideClientProposal({
      organizationId: 'org-1',
      projectId: 'proj-1',
      proposalId: 'prop-create',
      actorId: 'mgr-1',
      decision: 'approve',
    });
    expect(resCreate.proposal.status).toBe('applied');
    expect(resCreate.appliedBriefId).toMatch(/^brief-/);
    expect(store.briefs.has(resCreate.appliedBriefId!)).toBe(true);
    expect(vi.mocked(startAdStudioAutopilot)).toHaveBeenCalledTimes(2);

    const resDecline = await decideClientProposal({
      organizationId: 'org-1',
      projectId: 'proj-1',
      proposalId: 'prop-decline',
      actorId: 'mgr-1',
      decision: 'decline',
    });
    expect(resDecline.proposal.status).toBe('declined');
    expect(resDecline.run).toBeNull();
    expect(store.feedback.find((f) => f.id === 'fb-3')?.status).toBe('declined');
  });
});
