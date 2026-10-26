import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'eventRejectedCount',
  'eventRejectedSampleNote',
  'registeredHeading',
  'noSchemas',
  'registerHeading',
  'registerDescription',
  'register',
  'duplicateSchemaError',
  'evolveSubmit',
  'noEventSchemas',
  'kpiSchemas',
  'kpiLiveSchemas',
  'kpiSilentSchemas',
  'typesTitle',
  'typesCenter',
  'registeredDescription',
  'coverageNoSchema',
  'coverageDescription',
  'trackingAlertsNotConnectedNote',
  'touchpointSchemaIntro',
  'touchpointSchemaAlreadyRegistered',
  'touchpointSchemaSetupButton',
  'volumeChartDescription',
  'eventVolumeDescription',
] as const;

describe('the data fields page speaks plainly', () => {
  it('English avoids schema / quarantine jargon', () => {
    for (const key of KEYS) {
      expect(en.SchemaRegistry[key]).not.toMatch(/schema|quarantin|register|touchpoint/i);
    }
  });

  it('Hebrew avoids סכימה / סכמה / הסגר / בידוד', () => {
    for (const key of KEYS) {
      expect(he.SchemaRegistry[key]).toMatch(/[֐-׿]/);
      expect(he.SchemaRegistry[key]).not.toMatch(/סכי?מ|הסגר|בידוד|לרשום|נרשמ|נקודות מגע|רשומה עבור/);
    }
  });
});
