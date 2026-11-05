import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'diffFieldAddNegativeKeywords',
  'diffFieldAddedKeywordResourceNames',
  'diffFieldAddedNegativeKeywordResourceNames',
  'diffFieldPreviousCreativeResourceName',
  'diffFieldNewCreativeResourceName',
] as const;

describe('change-summary row labels use plain words', () => {
  it('English avoids "negative" and bare "ids"', () => {
    for (const key of KEYS) expect(en.Automation[key], key).not.toMatch(/negative|\bids?\b/i);
  });

  it('Hebrew avoids the technical "מזהה/מזהי" and "שליליות"', () => {
    for (const key of KEYS) expect(he.Automation[key], key).not.toMatch(/מזהה|מזהי|שליליות|[A-Za-z]/);
  });
});
