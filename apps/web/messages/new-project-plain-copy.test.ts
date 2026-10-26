import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('new project page copy', () => {
  it('uses "business type" rather than "vertical" / תחום', () => {
    expect(en.NewProjectPage.formDescription).toMatch(/business type/);
    expect(en.NewProjectPage.formDescription).not.toMatch(/vertical/i);
    expect(he.NewProjectPage.formDescription).toMatch(/סוג עסק/);
    expect(he.NewProjectPage.formDescription).not.toMatch(/תחום/);
  });

  it('describes Growth Pilot, not the technical setup guide, as what happens next', () => {
    const keys = [
      'nextDescription',
      'nextPackTitle',
      'nextSourceTitle',
      'nextFunnelTitle',
      'nextBoardTitle',
    ] as const;
    expect(en.NewProjectPage.nextPackTitle).toMatch(/website/i);
    expect(en.NewProjectPage.nextFunnelDescription).toMatch(/switched off/);
    for (const key of keys) {
      expect(en.NewProjectPage[key]).not.toMatch(/setup guide|data source|customer path|dashboard/i);
      expect(he.NewProjectPage[key]).not.toMatch(/מדריך|הלוח|מסלול הלקוח/);
    }
    expect(he.NewProjectPage.nextPackTitle).toMatch(/אתר/);
    expect(he.NewProjectPage.nextFunnelDescription).toMatch(/כבויה/);
  });
});
