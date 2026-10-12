import { describe, expect, it } from 'vitest';
import { buildLengthRepairPrompt, overLengthItems } from './length-repair';
import { buildAdCopyPrompt } from './copy';
import { buildSearchAdPrompt } from './search-ads';

const BRIEF = { name: 'Sign fast', objective: 'Trial signups', productDescription: 'E-signatures for lawyers', landingPageUrl: null, format: 'vertical' as const, language: 'he', targetSeconds: 15 };

describe('length repair', () => {
  it('picks only the fields over their limit, ignoring surrounding spaces', () => {
    const items = [
      { id: 'a', text: 'Short', max: 30 },
      { id: 'b', text: 'x'.repeat(31), max: 30 },
      { id: 'c', text: `  ${'y'.repeat(30)}  `, max: 30 },
    ];
    expect(overLengthItems(items).map((item) => item.id)).toEqual(['b']);
  });

  it('asks for complete phrases within each limit, keeping claims, in the ad language', () => {
    const prompt = buildLengthRepairPrompt([{ id: 'h1', text: 'A headline that is far too long for its slot', max: 30 }], 'he');
    expect(prompt.system).toContain('never end mid-word or mid-sentence');
    expect(prompt.system).toContain('Keep the same language (Hebrew)');
    expect(prompt.system).toContain('Never invent facts');
    expect(JSON.parse(prompt.user.split('\n')[1])).toEqual([{ id: 'h1', max: 30, text: 'A headline that is far too long for its slot' }]);
  });
});

describe('copy prompts', () => {
  it('give every creative its own angle and add urgency only when stated', () => {
    const prompt = buildAdCopyPrompt(BRIEF, [{ key: 'video', kind: 'video', about: 'A lawyer signs on a phone' }]);
    expect(prompt.system).toContain('no two creatives may share a headline');
    expect(prompt.system).toContain('Urgency (an offer, a deadline) only when the brief or context states one');
    expect(prompt.system).not.toContain('a reason to act');
  });

  it('search ads no longer ask for a reason to act now', () => {
    const prompt = buildSearchAdPrompt(BRIEF, []);
    expect(prompt.system).not.toContain('a reason to act now');
    expect(prompt.system).toContain('an offer or deadline only when the brief or context states one');
    expect(prompt.system).toContain('Never invent facts');
  });
});

describe('rewriting one image idea', () => {
  it('names the idea, shows the others for distinctness, and passes the request as tagged data', async () => {
    const { buildImageConceptRewritePrompt } = await import('./images');
    const concepts = [
      { visualPrompt: 'A desk without paper', headline: 'No more paper' },
      { visualPrompt: 'A grey office', headline: 'Sign online' },
    ];
    const prompt = buildImageConceptRewritePrompt(BRIEF, concepts, 1, 'warmer light');
    expect(prompt.system).toContain('Rewrite only idea 2');
    expect(prompt.user).toContain('"visualPrompt":"A desk without paper"');
    expect(prompt.user).toContain(['<editor_request>', 'warmer light', '</editor_request>'].join('\n'));
    expect(prompt.user).not.toContain('Propose the image ideas.');
  });
});
