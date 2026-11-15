import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the "how up to date" failure line speaks plainly and says what to do', () => {
  it('en: no "warehouse", offers a retry and someone to ask, keeps the detail', () => {
    const t = en.IngestHealth.warehouseFreshnessError;
    expect(t).not.toMatch(/warehouse/i);
    expect(t).toMatch(/Try again/);
    expect(t).toContain('{message}');
  });

  it('he: no "data warehouse", offers a retry, keeps the detail', () => {
    const t = he.IngestHealth.warehouseFreshnessError;
    expect(t).not.toContain('מחסן');
    expect(t).toContain('נסו שוב');
    expect(t).toContain('{message}');
  });
});
