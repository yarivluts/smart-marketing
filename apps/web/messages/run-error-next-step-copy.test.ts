import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const lines = [
  ['en', en.IngestHealth.orchestrationRunError, en.ProjectPlugins.sourceRunErrorLine],
  ['he', he.IngestHealth.orchestrationRunError, he.ProjectPlugins.sourceRunErrorLine],
] as const;

describe('a failed run says what to do next, not just "Error"', () => {
  it.each(lines)('%s: keeps the technical detail and is not a bare error label', (_l, a, b) => {
    for (const text of [a, b]) {
      expect(text).toContain('{message}');
      expect(text.length).toBeGreaterThan(40);
    }
  });

  it('en: offers a retry and someone to ask', () => {
    for (const text of [en.IngestHealth.orchestrationRunError, en.ProjectPlugins.sourceRunErrorLine]) {
      expect(text).toMatch(/did not finish/);
      expect(text).toMatch(/Try again/);
      expect(text).not.toMatch(/^Error:/);
    }
  });

  it('he: offers a retry', () => {
    for (const text of [he.IngestHealth.orchestrationRunError, he.ProjectPlugins.sourceRunErrorLine]) {
      expect(text).toContain('נסו שוב');
      expect(text).not.toMatch(/^שגיאה:/);
    }
  });
});
