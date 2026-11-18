import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Req = Record<string, string>;
const req = (m: unknown): Req => (m as { AdShare: { requests: Req } }).AdShare.requests;

describe('agency client comments queue: plain words', () => {
  it('en: no jargon in the queue labels', () => {
    const c = req(en);
    const keys = ['title', 'intro', 'summaryToggle', 'generateProposals', 'generatingProposals', 'copyReport', 'downloadReport', 'copyFixAgent', 'feedbackQueueTitle', 'proposalsQueueTitle', 'approveProposal', 'appliedTag', 'sendUpdatedBody'];
    for (const k of keys) {
      expect(c[k], k).toBeTruthy();
      expect(c[k], k).not.toMatch(/\bAI\b.*queue|regeneration|renders|\bMint\b|fix-agent|return report|\(\.md\)/i);
    }
  });

  it('en: says nothing changes until you approve', () => {
    expect(req(en).intro).toContain('Nothing changes until you approve');
  });

  it('he: applied tag keeps its placeholders-free plain wording', () => {
    expect(req(he).appliedTag).toBeTruthy();
    expect(req(he).appliedTag).not.toBe(req(en).appliedTag);
  });
});
