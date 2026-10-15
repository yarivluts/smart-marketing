import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['projectSchemaRegistryLink', 'projectIngestHealthLink', 'projectHooksLink', 'projectCohortsLink'] as const;

describe('the data and retention sidebar links use words a beginner knows', () => {
  it('English links avoid registry / ingest / hooks / cohort jargon', () => {
    for (const key of KEYS) {
      expect(en.OrgDetailPage[key]).not.toMatch(/registry|ingest|hook|cohort/i);
    }
  });

  it('Hebrew links stay in Hebrew and avoid the old technical names', () => {
    for (const key of KEYS) {
      expect(he.OrgDetailPage[key]).toMatch(/[֐-׿]/);
      expect(he.OrgDetailPage[key]).not.toMatch(/סכימ|הזרמ|וֶבְּהוּק|קבוצות/);
    }
  });
});
