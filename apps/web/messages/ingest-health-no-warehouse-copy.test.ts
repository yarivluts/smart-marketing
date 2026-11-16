import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const IH_KEYS = ['reexportRawRecords', 'reexportError', 'reexportNotConfigured', 'flowWarehouse'] as const;

const SR_KEYS = ['syncMartsButton', 'syncMartsError', 'syncMartsNotConfigured'] as const;

describe('Admin data buttons: plain words instead of warehouse and raw records', () => {
  it('en: no "warehouse", "re-export" or "raw records"', () => {
    for (const key of SR_KEYS) {
      expect(en.SchemaRegistry[key], key).not.toMatch(/warehouse/i);
    }
    for (const key of IH_KEYS) {
      expect(en.IngestHealth[key], key).not.toMatch(/warehouse|re-export|raw record/i);
    }
  });

  it('he: no data-warehouse wording', () => {
    for (const key of SR_KEYS) {
      expect(he.SchemaRegistry[key], key).not.toMatch(/מחסן/);
    }
    for (const key of IH_KEYS) {
      expect(he.IngestHealth[key], key).not.toMatch(/מחסן|גולמי/);
    }
  });
});
