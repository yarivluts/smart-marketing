import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('Hooks queue note speaks plain words', () => {
  it.each([
    ['en', en],
    ['he', he],
  ])('%s: no "ingest" or "payload" jargon', (_l, m) => {
    const note = (m as unknown as Copy).Hooks.queueNotIngestedNote;
    expect(note.length).toBeGreaterThan(40);
    expect(note).not.toMatch(/ingest|payload|delivery|deliveries|קולט|נקלט|מסירה|מסירות/i);
  });

  it('en: says the message is not in the reports yet', () => {
    expect((en as unknown as Copy).Hooks.queueNotIngestedNote).toMatch(/not counted in your reports yet/);
  });
});
