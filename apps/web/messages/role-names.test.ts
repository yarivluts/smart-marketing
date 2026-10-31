import { describe, expect, it } from 'vitest';
import { ROLES } from '@growthos/shared';
import en from './en.json';
import he from './he.json';

describe('Roles messages', () => {
  it.each([
    ['en', en.Roles],
    ['he', he.Roles],
  ])('names every role in plain words (%s)', (_locale, names) => {
    for (const role of ROLES) {
      const label = (names as Record<string, string>)[role];
      expect(label, role).toBeTruthy();
      expect(label).not.toContain('_');
    }
  });
});
