import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, unknown>;

function find(root: Copy, key: string): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Copy)) {
      if (k === key && typeof v === 'string') out.push(v);
      else walk(v);
    }
  };
  walk(root);
  return out;
}

const KEYS = [
  'heatmap',
  'heatmapEmpty',
  'retentionCurveTitle',
  'retentionCurveDescription',
  'retentionCurveSeries',
  'byCohortDescription',
  'setupFeatureChannelsDescription',
];

describe('Boards and Quality page: sign-up month, not cohort / retention', () => {
  it('en: no cohort or retention jargon', () => {
    for (const key of KEYS) {
      const values = find(en as Copy, key);
      expect(values.length, key).toBeGreaterThan(0);
      for (const v of values) expect(v, key).not.toMatch(/cohort|retention|baseline/i);
    }
  });

  it('he: no קוהורט / עקומת שימור / מחזור הרשמה', () => {
    for (const key of KEYS) {
      const values = find(he as Copy, key);
      expect(values.length, key).toBeGreaterThan(0);
      for (const v of values) expect(v, key).not.toMatch(/קוהורט|עקומת שימור|מחזור הרשמה/);
    }
  });
});
