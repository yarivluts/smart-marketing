import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'description',
  'schemaPickerLabel',
  'noEventSchemasRegistered',
  'empty',
  'filterDeclaredFieldsGroup',
  'noEventSchemasDetail',
] as const;

describe('the latest-records page speaks plainly about "kinds of record"', () => {
  it('English copy avoids "schema" jargon', () => {
    for (const key of KEYS) {
      expect(en.RecordFeed[key]).not.toMatch(/schema|register/i);
    }
  });

  it('Hebrew copy is Hebrew and avoids the old schema wording', () => {
    for (const key of KEYS) {
      expect(he.RecordFeed[key]).toMatch(/[֐-׿]/);
      expect(he.RecordFeed[key]).not.toMatch(/סכימ/);
    }
  });

  it('points to the renamed "Match your fields" page', () => {
    expect(en.RecordFeed.noEventSchemasDetail).toContain('Match your fields');
  });
});
