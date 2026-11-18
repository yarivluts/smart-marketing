import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Customer groups: no CRM plugin installed yet', () => {
  it('explains in plain words what to do and where (en)', () => {
    const line = en.Segments.crmSyncNoInstalls;
    expect(line).toContain('customer-management tool (CRM)');
    expect(line).toContain('Plugins page');
    expect(line).not.toMatch(/CRM-sync|export/i);
  });

  it('says the same in Hebrew without the old technical wording', () => {
    const line = he.Segments.crmSyncNoInstalls;
    expect(line).toContain('CRM');
    expect(line).not.toContain('סנכרון CRM');
    expect(line).not.toContain('לייצא');
  });
});
