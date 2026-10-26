import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Metric registry labels avoid developer jargon', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const s = (lang as unknown as Record<string, Record<string, string>>).MetricRegistry;
    const text = [s.evolve, s.evolveHeading, s.evolveSubmit, s.archiveStillReferencedError].join('\n');

    it(`does not use Evolve or formula-metric wording (${name})`, () => {
      expect(text).not.toMatch(name === 'en' ? /evolve|formula metric/i : /פיתוח|פתחו גרסה/);
    });
  }
});
