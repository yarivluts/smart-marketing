import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('incoming data and field matching pages use plain words', () => {
  it('English says "turned into records", not "ingested" or "envelope"', () => {
    const lines = [
      en.Hooks.appliedViaMapping,
      en.Hooks.kpiApplied,
      en.Hooks.kpiPendingSub,
      en.FieldMappings.kpiApplied,
      en.FieldMappings.noMappingsDetail,
      en.FieldMappings.envelopeErrors,
      en.FieldMappings.mappingErrors,
    ];
    for (const line of lines) expect(line).not.toMatch(/ingest|envelope/i);
    expect(en.FieldMappings.kpiApplied).toMatch(/records/);
  });

  it('Hebrew drops "מעטפה" and "נקלט" and keeps the placeholders', () => {
    const lines = [
      he.Hooks.appliedViaMapping,
      he.Hooks.kpiApplied,
      he.Hooks.kpiPendingSub,
      he.FieldMappings.kpiApplied,
      he.FieldMappings.noMappingsDetail,
      he.FieldMappings.envelopeErrors,
      he.FieldMappings.mappingErrors,
    ];
    for (const line of lines) expect(line).not.toMatch(/מעטפ|נקלט|נקלטו/);
    expect(he.Hooks.appliedViaMapping).toContain('{batchId}');
    expect(he.FieldMappings.envelopeErrors).toContain('{errors}');
  });
});
