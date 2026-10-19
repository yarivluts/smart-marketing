import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'hookEndpointLabel',
  'hookEndpointNone',
  'heroDescription',
  'kpiPendingSub',
  'flowDescription',
  'flowAnySource',
  'flowEmptyDetail',
  'flowHooksLink',
  'flowAnySourceSub',
] as const;

describe('the field mappings page speaks plainly', () => {
  it('English avoids hook / webhook / payload / endpoint jargon in the intro and flow', () => {
    for (const key of KEYS) {
      expect(en.FieldMappings[key]).not.toMatch(/hook|payload|endpoint/i);
    }
    expect(en.FieldMappings.flowHooksLink).toMatch(/incoming data links/i);
  });

  it('Hebrew stays in Hebrew, with no English jargon, מטען or נקודת קצה', () => {
    for (const key of KEYS) {
      expect(he.FieldMappings[key]).toMatch(/[֐-׿]/);
      expect(he.FieldMappings[key]).not.toMatch(/hook|webhook|מטען|המטענים|נקודות? קצה|וֶבְּהוּק/i);
    }
    expect(he.FieldMappings.flowHooksLink).toMatch(/קישורי נתונים נכנסים/);
  });
});
