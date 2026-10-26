import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('organization page for a newcomer with no project yet', () => {
  it('tells them to type their website, not to connect data and build reports', () => {
    expect(en.OrgDetailPage.noProjectsHint).toMatch(/website/i);
    expect(en.OrgDetailPage.noProjectsHint).not.toMatch(/connect data|reports/i);
    expect(he.OrgDetailPage.noProjectsHint).toContain('כתובת האתר');
    expect(he.OrgDetailPage.noProjectsHint).not.toContain('דוחות');
  });

  it('names the data tool group in plain words', () => {
    expect(en.OrgDetailPage.groupData).not.toMatch(/pipeline/i);
    expect(he.OrgDetailPage.groupData).not.toContain('צנרת');
  });
});
