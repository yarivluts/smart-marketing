import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Bag = Record<string, any>;

describe('data field pages name the Access keys page the way the sidebar does', () => {
  it('English says Access keys and avoids ingest / quarantine / API keys', () => {
    const d = findSection(en as Bag, 'touchpointSchemaIntro');
    expect(d.touchpointSchemaIntro).toContain('Access keys');
    for (const v of [d.touchpointSchemaIntro, d.volumeChartEmptyDetail]) {
      expect(v).not.toMatch(/ingest|quarantin|API keys/i);
    }
  });

  it('Hebrew says מפתחות הגישה and avoids the old API-key wording', () => {
    const d = findSection(he as Bag, 'touchpointSchemaIntro');
    expect(d.touchpointSchemaIntro).toContain('מפתחות הגישה');
    for (const v of [d.touchpointSchemaIntro, d.volumeChartEmptyDetail]) {
      expect(v).not.toMatch(/API|הסגר|סכמ/);
    }
  });
});

function findSection(o: Bag, key: string): Bag {
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      if (key in v) return v;
      const r = findSection(v, key);
      if (r) return r;
    }
  }
  return undefined as unknown as Bag;
}
