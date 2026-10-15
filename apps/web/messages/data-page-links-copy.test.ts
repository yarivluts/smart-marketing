import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Bag = Record<string, unknown>;


function findKeys(o: Bag, key: string, out: string[] = []): string[] {
  for (const [k, v] of Object.entries(o)) {
    if (k === key && typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object') findKeys(v as Bag, key, out);
  }
  return out;
}

const KEYS = [
  'sourceStepIngestHealthLink',
  'eventRejectedLink',
  'coverageIngestHealthLink',
  'registerSchemaCta',
  'noEventSchemasDetail',
  'noEntitySchemasDetail',
  'touchpointSnippetVerify',
];

describe('in-page links name the sidebar pages the way the sidebar does', () => {
  it('English text says Data health / Data fields, not ingest or schema registry', () => {
    for (const key of KEYS) {
      const values = findKeys(en as Bag, key);
      expect(values.length, key).toBeGreaterThan(0);
      for (const v of values) expect(v, key).not.toMatch(/ingest|schema registry/i);
    }
    expect(findKeys(en as Bag, 'registerSchemaCta')[0]).toContain('Data fields');
    expect(findKeys(en as Bag, 'coverageIngestHealthLink')[0]).toContain('Data health');
  });

  it('Hebrew text uses the sidebar names and no Latin page names', () => {
    for (const key of KEYS) {
      for (const v of findKeys(he as Bag, key)) {
        expect(v, key).not.toMatch(/Ingest|health|סכמות|תקינות הקליטה/);
      }
    }
    expect(findKeys(he as Bag, 'registerSchemaCta')[0]).toContain('שדות הנתונים');
    expect(findKeys(he as Bag, 'coverageIngestHealthLink')[0]).toContain('תקינות הנתונים');
  });

  it('the tracking alert action points to Data health', () => {
    expect(findKeys(en as Bag, 'tracking_alert')).toContain('Check Data health');
  });
});
