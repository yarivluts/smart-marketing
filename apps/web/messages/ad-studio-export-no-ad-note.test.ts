import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// Exporting only uploads a video; a newcomer must be told it starts no ad and spends no money.
describe('Ad Studio export step reassures that nothing goes live', () => {
  const enStudio = en.AdStudio as unknown as Record<string, string>;
  const heStudio = he.AdStudio as unknown as Record<string, string>;

  it('has the note in both languages', () => {
    expect(enStudio.exportNoAdNote).toMatch(/no money is spent/);
    expect(enStudio.exportNoAdNote).toMatch(/nothing goes live/);
    expect(heStudio.exportNoAdNote).toBeTruthy();
    expect(heStudio.exportNoAdNote).not.toMatch(/[A-Za-z]/);
  });
});
