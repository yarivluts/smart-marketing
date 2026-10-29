import { describe, expect, it } from 'vitest';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('Hebrew: sentences speak to the team in the plural', () => {
  const m = he as unknown as Copy;

  it('the support pack and CRM sync hints use the plural, not "התקן" or "התקן/י"', () => {
    expect(m.Support.setupIntro).toMatch(/^התקינו /);
    expect(m.Support.setupIntro).not.toContain('/י');
    expect(m.Segments.crmSyncNoInstalls).toMatch(/^התקינו /);
  });

  it('the support pack intro says "support requests", not "ticket life cycle events"', () => {
    expect(m.Support.setupIntro).not.toContain('מחזור חיי');
  });
});
