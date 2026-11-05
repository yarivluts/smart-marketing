import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const keys = [
  'proposeTargetLabel',
  'proposeDraftTargetLabel',
  'proposeKeywordEditTargetLabel',
  'proposeAdEditTargetLabel',
  'proposeMetaAdSetEditTargetLabel',
  'proposeMetaAdSetTargetingEditTargetLabel',
  'proposeMetaAdCreativeEditTargetLabel',
] as const;

describe('change-suggestion forms ask "Which ad" instead of "Target"', () => {
  it('English picker labels say Which ad', () => {
    for (const k of keys) expect(en.Automation[k]).toBe('Which ad');
  });

  it('Hebrew picker labels are plain and never the bare word יעד', () => {
    for (const k of keys) {
      expect(he.Automation[k]).toBe('איזו מודעה');
      expect(he.Automation[k]).not.toBe('יעד');
    }
  });
});
