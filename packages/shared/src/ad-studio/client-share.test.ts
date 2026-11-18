import { describe, expect, it } from 'vitest';
import {
  buildClientFeedbackFixPrompt,
  buildClientFeedbackReport,
  validateClientFeedbackInput,
  type AdShareFeedbackItem,
} from './client-share';

const ITEMS: AdShareFeedbackItem[] = [
  {
    id: 'f1',
    shareLinkId: 'link-1',
    clientLabel: 'Dana @ EasySign',
    authorName: 'Dana',
    targetKind: 'brief',
    briefId: 'b1',
    briefName: 'Spring Sale Video',
    creativeRef: 'video',
    campaignId: null,
    campaignLabel: null,
    verdict: 'changes_requested',
    comment: 'Please mention 14-day free trial in scene 1 and use brighter natural office light.',
    status: 'open',
    createdOn: '2026-11-18T08:00:00.000Z',
    resolvedOn: null,
  },
  {
    id: 'f2',
    shareLinkId: 'link-1',
    clientLabel: 'Dana @ EasySign',
    authorName: 'Dana',
    targetKind: 'general',
    briefId: null,
    briefName: null,
    creativeRef: null,
    campaignId: null,
    campaignLabel: null,
    verdict: 'request',
    comment: 'Create an additional vertical ad focused on accountants.',
    status: 'proposed',
    createdOn: '2026-11-18T08:05:00.000Z',
    resolvedOn: null,
  },
  {
    id: 'f3',
    shareLinkId: 'link-1',
    clientLabel: 'Dana @ EasySign',
    authorName: 'Dana',
    targetKind: 'brief',
    briefId: 'b2',
    briefName: 'Brand Static',
    creativeRef: 'idea:1',
    campaignId: null,
    campaignLabel: null,
    verdict: 'approved',
    comment: '',
    status: 'open',
    createdOn: '2026-11-18T08:10:00.000Z',
    resolvedOn: null,
  },
];

describe('ad-studio client share helpers', () => {
  it('validates feedback targets, verdicts, and required comments except empty approvals', () => {
    expect(validateClientFeedbackInput({ targetKind: 'brief', briefId: 'b1', verdict: 'approved', comment: '' })).toEqual([]);
    expect(validateClientFeedbackInput({ targetKind: 'brief', briefId: 'b1', verdict: 'changes_requested', comment: '' })).toContain('comment_required');
    expect(validateClientFeedbackInput({ targetKind: 'brief', verdict: 'comment', comment: 'Looks good' })).toContain('brief_id_required');
    expect(validateClientFeedbackInput({ targetKind: 'campaign', verdict: 'comment', comment: 'Pause it' })).toContain('campaign_required');
    expect(validateClientFeedbackInput({ targetKind: 'general', verdict: 'request', comment: 'Make one for SMBs' })).toEqual([]);
  });

  it('builds Markdown return reports in both English and Hebrew', () => {
    const enReport = buildClientFeedbackReport({
      projectName: 'EasySign Q4',
      brandName: 'EasySign',
      generatedAt: '2026-11-18T10:00:00.000Z',
      locale: 'en',
      items: ITEMS,
    });
    expect(enReport).toContain('# Client Feedback Return Report');
    expect(enReport).toContain('Changes requested: 1');
    expect(enReport).toContain('Requests: 1');
    expect(enReport).toContain('Spring Sale Video');

    const heReport = buildClientFeedbackReport({
      projectName: 'EasySign Q4',
      brandName: 'EasySign',
      generatedAt: '2026-11-18T10:00:00.000Z',
      locale: 'he',
      items: ITEMS,
    });
    expect(heReport).toContain('\u05d3\u05d5\u05d7 \u05de\u05e9\u05d5\u05d1');
    expect(heReport).toContain('Create an additional vertical ad focused on accountants.');
  });

  it('builds an actionable AI fix-agent prompt from open requests and brief state', () => {
    const prompt = buildClientFeedbackFixPrompt({
      projectName: 'EasySign Q4',
      brandName: 'EasySign',
      items: ITEMS,
      briefs: [
        {
          id: 'b1',
          name: 'Spring Sale Video',
          objective: 'Trial signups',
          productDescription: 'E-signatures for teams',
          landingPageUrl: 'https://easysign.example.com',
          language: 'en',
          videoInstructions: 'Warm natural light',
          videoCopy: { headline: 'Sign Faster', primaryText: 'Send contracts online', description: '' },
          scenes: [{ id: 's1', durationSeconds: 5, visualPrompt: 'Office desk', voiceover: 'Sign today' }],
          imageConcepts: [{ id: 'c1', headline: 'Fast signing', visualPrompt: 'Smartphone screen' }],
          searchAd: null,
        },
      ],
    });
    expect(prompt).toContain('GrowthOS Ad Fix Agent');
    expect(prompt).toContain('14-day free trial in scene 1');
    expect(prompt).toContain('Brief b1: Spring Sale Video');
    expect(prompt).toContain('Warm natural light');
    // Approved without comment is excluded from fix prompt action list
    expect(prompt).not.toContain('Brand Static');
  });
});
