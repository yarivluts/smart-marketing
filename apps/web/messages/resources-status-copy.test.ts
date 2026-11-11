import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// Every status an attachment can have is spelled out in words; none falls through to the raw English code.
const STATUSES = ['approved', 'pending', 'rejected', 'detached'];

describe('Project resources status label', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    it(`has a plain word for every attachment status (${name})`, () => {
      const label = (lang.ProjectResources as { statusLabel: string }).statusLabel;
      for (const status of STATUSES) {
        expect(label).toContain(`${status} {`);
      }
    });
  }
});
