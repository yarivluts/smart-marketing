import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

const KEYS = [
  'noBatches', 'neverIngestedLabel', 'freshnessLabel', 'batchCapNote', 'quarantineHeading', 'noQuarantinedRecords',
  'quarantineCapNote', 'replayOutcomeStillQuarantined', 'dismissConfirm', 'pipelineFailuresHeading', 'noPipelineFailures',
  'kpiLastBatch', 'flowReceivedSub', 'flowQuarantinedSub', 'outcomesDescription',
];

describe('Data health page: plain words', () => {
  it('en: no ingest / batch / quarantine / pipeline jargon', () => {
    const m = (en as unknown as Copy).IngestHealth;
    for (const key of KEYS) expect(m[key].replace(/{[^}]*}/g, ''), key).not.toMatch(/ingest|batch|quarantin|pipeline/i);
  });

  it('he: no הסגר / אצווה / צינור jargon', () => {
    const m = (he as unknown as Copy).IngestHealth;
    for (const key of KEYS) expect(m[key].replace(/{[^}]*}/g, ''), key).not.toMatch(/הסגר|אצוו|אצווה|צינור|הוזרמ/);
  });

  it('the empty state says when data will show up', () => {
    expect((en as unknown as Copy).IngestHealth.noBatches).toMatch(/shows up here/);
  });

  it('both languages keep the same keys', () => {
    expect(Object.keys((he as unknown as Copy).IngestHealth).sort()).toEqual(Object.keys((en as unknown as Copy).IngestHealth).sort());
  });
});
