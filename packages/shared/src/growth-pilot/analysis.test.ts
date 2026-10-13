import { describe, expect, it } from 'vitest';
import {
  buildSiteAnalysisPrompt,
  buildTargetFromRequestPrompt,
  buildTargetRevisionPrompt,
  proposedTargetsFromAnalysis,
  sanitizeSiteAnalysis,
  sanitizeTargetDraft,
  type GrowthSiteAnalysis,
} from './analysis';

const ANALYSIS: GrowthSiteAnalysis = {
  businessName: 'EasySign',
  summary: 'Digital signatures over WhatsApp.',
  language: 'he',
  offerings: [
    { kind: 'service', name: 'Digital signature', description: 'Sign in 30 seconds', forWhom: 'Small law firms', why: 'Firms lose clients to paperwork' },
    { kind: 'product', name: 'Templates', description: 'Ready contracts', forWhom: 'Freelancers', why: 'Ready contracts' },
  ],
  audiences: [
    { name: 'Law firms', description: 'Small firms', needs: 'Faster client signatures', why: 'They sign daily' },
    { name: 'Accountants', description: 'Bookkeeping offices', needs: 'Signed forms', why: '' },
    { name: 'digital signature', description: 'duplicate by name', needs: '', why: '' },
  ],
};

describe('site analysis prompt', () => {
  it('gives the model every page with its parts, capped, and the rules against inventing', () => {
    const prompt = buildSiteAnalysisPrompt([
      { url: 'https://a.co/', title: 'A', description: 'Desc', headings: ['H1', 'H2'], text: 'x'.repeat(5000) },
      { url: 'https://a.co/services', title: 'Services', description: '', headings: [], text: '' },
    ]);
    expect(prompt.user).toContain('### Page 1: https://a.co/');
    expect(prompt.user).toContain('Headings: H1 | H2');
    expect(prompt.user).toContain('### Page 2: https://a.co/services');
    expect(prompt.user).not.toContain('x'.repeat(3001));
    expect(prompt.system).toMatch(/never invent/);
    expect(prompt.system).toMatch(/language of the site/);
  });

  it('revises a target with the request and the business context, and turns a request into a target', () => {
    const revision = buildTargetRevisionPrompt({ analysis: ANALYSIS, draft: { kind: 'audience', name: 'Law firms', description: 'd', audience: 'a', reason: 'r' }, request: 'Only Tel Aviv' });
    expect(revision.system).toContain('EasySign');
    expect(revision.user).toContain('Only Tel Aviv');
    expect(revision.user).toContain('"name": "Law firms"');
    const fromRequest = buildTargetFromRequestPrompt({ analysis: ANALYSIS, request: 'Accountants in the north' });
    expect(fromRequest.user).toContain('- service: Digital signature - Sign in 30 seconds');
    expect(fromRequest.user).toContain('Accountants in the north');
  });
});

describe('sanitizing what the model returned', () => {
  it('trims, caps and drops nameless entries; unknown kinds become services', () => {
    const clean = sanitizeSiteAnalysis({
      businessName: '  EasySign  ',
      summary: 's',
      language: 'HE',
      offerings: [{ kind: 'other' as 'service', name: ' Sign ', description: 'd', forWhom: 'f', why: ' w ' }, { kind: 'product', name: ' ', description: '', forWhom: '', why: '' }],
      audiences: [{ name: 'A\n group', description: 'd', needs: 'n', why: 'y' }],
    });
    expect(clean).toEqual({ businessName: 'EasySign', summary: 's', language: 'he', offerings: [{ kind: 'service', name: 'Sign', description: 'd', forWhom: 'f', why: 'w' }], audiences: [{ name: 'A group', description: 'd', needs: 'n', why: 'y' }] });
    expect(sanitizeSiteAnalysis({ ...clean, language: '' }).language).toBe('en');
  });

  it('rejects a draft without a name or with an unknown kind', () => {
    expect(sanitizeTargetDraft({ kind: 'service', name: ' ', description: '', audience: '', reason: '' })).toBeNull();
    expect(sanitizeTargetDraft({ kind: 'thing' as 'service', name: 'X', description: '', audience: '', reason: '' })).toBeNull();
    expect(sanitizeTargetDraft({ kind: 'audience', name: ' X ', description: 'd', audience: 'a', reason: 'r' })).toEqual({ kind: 'audience', name: 'X', description: 'd', audience: 'a', reason: 'r' });
  });
});

describe('proposedTargetsFromAnalysis', () => {
  it('proposes offerings then audiences, without repeating a name', () => {
    const targets = proposedTargetsFromAnalysis(ANALYSIS);
    expect(targets.map((target) => `${target.kind}:${target.name}`)).toEqual(['service:Digital signature', 'product:Templates', 'audience:Law firms', 'audience:Accountants']);
    expect(targets[0].reason).toBe('Firms lose clients to paperwork');
    // A reason that only repeats the description is dropped, so the card never says the same thing twice.
    expect(targets[1].reason).toBe('');
  });

  it('keeps room for audiences when offerings alone would fill the limit', () => {
    const many: GrowthSiteAnalysis = { ...ANALYSIS, offerings: Array.from({ length: 8 }, (_, index) => ({ kind: 'product' as const, name: `P${index}`, description: '', forWhom: '', why: '' })) };
    const targets = proposedTargetsFromAnalysis(many, 6);
    expect(targets).toHaveLength(6);
    expect(targets.filter((target) => target.kind === 'audience')).toHaveLength(2);
    expect(proposedTargetsFromAnalysis({ ...ANALYSIS, audiences: [] }, 6).every((target) => target.kind !== 'audience')).toBe(true);
  });
});
