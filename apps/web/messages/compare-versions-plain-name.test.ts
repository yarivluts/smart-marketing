import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Compare versions page: no bare A/B jargon in the name', () => {
  it('en: menu label is plain and the page still mentions the A/B term once', () => {
    expect(en.OrgDetailPage.projectExperimentsLink).not.toMatch(/A\/B/);
    expect(en.Experiments.description).toMatch(/A\/B/);
  });
  it('he: menu label has no Latin letters', () => {
    expect(he.OrgDetailPage.projectExperimentsLink).not.toMatch(/[A-Za-z]/);
    expect(he.Experiments.resultsEmpty).not.toMatch(/[A-Za-z]/);
  });
});
