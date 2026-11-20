import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'replayButtonLabel',
  'replayError',
  'flowDelivery',
  'dismissButtonLabel',
  'dismissError',
] as const;

describe('Data health rejected-record buttons speak plainly', () => {
  it('English avoids replay / pipeline / dismiss jargon', () => {
    for (const key of KEYS) {
      expect(en.IngestHealth[key]).not.toMatch(/replay|pipeline|dismiss/i);
    }
  });

  it('Hebrew avoids שידור, צינור and ביטול-for-delete wording, and has no Latin letters', () => {
    for (const key of KEYS) {
      const text = he.IngestHealth[key];
      expect(text).toMatch(/[֐-׿]/);
      expect(text).not.toMatch(/[A-Za-z]|שידור|לשדר|צינור|בטל/);
    }
  });

  it('the buttons say what they do', () => {
    expect(en.IngestHealth.replayButtonLabel).toBe('Try again');
    expect(en.IngestHealth.dismissButtonLabel).toBe('Discard');
  });
});
