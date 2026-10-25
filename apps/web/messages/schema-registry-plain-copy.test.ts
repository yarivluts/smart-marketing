import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'eventRejectedCount',
  'eventRejectedSampleNote',
  'registeredHeading',
  'noSchemas',
  'fieldPiiHeader',
  'fieldIdentityKeyHeader',
  'evolve',
  'registerHeading',
  'register',
  'duplicateSchemaError',
  'evolveHeading',
  'evolveSubmit',
  'breakingChangeError',
  'eventVolumeHeading',
  'noEventSchemas',
  'trackingAlertsNotConnectedNote',
  'heroDescription',
  'kpiSchemas',
  'kpiLiveSchemas',
  'kpiSilentSchemas',
  'volumeChartDescription',
  'typesTitle',
  'typesDescription',
  'typeEntity',
  'typeMeasure',
  'coverageTitle',
  'coverageDescription',
  'chipLegendSilent',
  'coverageUnmapped',
  'coverageNoSchema',
  'chipNotRegistered',
  'eventVolumeDescription',
  'registeredDescription',
  'noSchemasDetail',
  'registerDescription',
] as const;

describe('the Data page speaks plainly', () => {
  it('English avoids schema / quarantine / evolve / registry / PII / entity jargon', () => {
    for (const key of KEYS) {
      expect(en.SchemaRegistry[key].replace(/\{[^}]*\}/g, '')).not.toMatch(/schema|quarantin|evolve|regist|\bPII\b|entit|consumers/i);
    }
    for (const hint of Object.values(en.SchemaRegistry.typeHint)) {
      expect(hint).not.toMatch(/entity|measure/i);
    }
  });

  it('Hebrew stays in Hebrew, without סכמה / בידוד / הסגר / ישות / פיתוח / רישום', () => {
    for (const key of KEYS) {
      expect(he.SchemaRegistry[key]).toMatch(/[֐-׿]/);
      expect(he.SchemaRegistry[key]).not.toMatch(/סכמ|בידוד|הסגר|ישות|ישויות|פיתוח|רישום|נרשמ|רשום\b|PII|צרכנ/);
    }
    for (const hint of Object.values(he.SchemaRegistry.typeHint)) {
      expect(hint).not.toMatch(/ישות|מדד -/);
    }
  });

  it('explains what a person or thing and a number over time are, with an example', () => {
    expect(en.SchemaRegistry.typeHint.entity).toMatch(/customer/i);
    expect(he.SchemaRegistry.typeHint.entity).toMatch(/לקוח/);
  });
});
