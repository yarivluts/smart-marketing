import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

const KEYS = {
  Customers: ['description', 'noEntitySchemasRegistered', 'schemaFilterLabel', 'resultSchemaLine', 'searchCardDescription', 'breakdownTitle', 'schemasDescription'],
  Segments: ['noEntitySchemasRegistered', 'noSegmentSuggestions', 'createDescription', 'eventConditionsHint'],
};

describe('Customers and Segments pages: plain words', () => {
  for (const [ns, keys] of Object.entries(KEYS)) {
    it(`en ${ns}: no schema / entity / register jargon`, () => {
      const m = (en as unknown as Copy)[ns];
      for (const key of keys) expect(m[key].replace(/{[^}]*}/g, ''), key).not.toMatch(/schema|entit|register|landed|PII/i);
    });

    it(`he ${ns}: no סכימ / ישות / רשומה-נרשמת jargon`, () => {
      const m = (he as unknown as Copy)[ns];
      for (const key of keys) expect(m[key].replace(/{[^}]*}/g, ''), key).not.toMatch(/סכימ|סכמ|ישות|ישויות|לרשום|רשומות הלקוחות שנקלטו/);
    });
  }

  it('the empty states tell the person what to do next', () => {
    expect((en as unknown as Copy).Customers.noEntitySchemasRegistered).toMatch(/Add a data source/);
    expect((en as unknown as Copy).Segments.noEntitySchemasRegistered).toMatch(/Add a data source/);
  });

  it('both languages keep the same keys', () => {
    for (const ns of Object.keys(KEYS)) {
      expect(Object.keys((he as unknown as Copy)[ns]).sort()).toEqual(Object.keys((en as unknown as Copy)[ns]).sort());
    }
  });
});
