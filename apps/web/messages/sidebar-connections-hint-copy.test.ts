import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the sidebar connections hint names the platforms people know', () => {
  it('says Facebook and Instagram, not the company name Meta, in English', () => {
    expect(en.AppShell.connectionsHint).toMatch(/Facebook/);
    expect(en.AppShell.connectionsHint).toMatch(/Instagram/);
    expect(en.AppShell.connectionsHint).not.toMatch(/\bMeta\b/);
  });

  it('says it in Hebrew letters, without the Latin word Meta', () => {
    expect(he.AppShell.connectionsHint).toContain('פייסבוק');
    expect(he.AppShell.connectionsHint).toContain('אינסטגרם');
    expect(he.AppShell.connectionsHint).not.toMatch(/\bMeta\b/);
  });
});
