import { describe, expect, it } from 'vitest';
import { API_KEY_SCOPES } from '@growthos/shared';
import en from './en.json';
import he from './he.json';

describe('access key permissions have plain labels', () => {
  it.each([
    ['en', en.ApiKeys.scopeNames],
    ['he', he.ApiKeys.scopeNames],
  ])('%s names every key scope without showing the scope itself', (_locale, names) => {
    for (const scope of API_KEY_SCOPES) {
      const label = (names as Record<string, string>)[scope.replace('.', '_')];
      expect(label, scope).toBeTruthy();
      expect(label).not.toMatch(/\w+\.(read|write)/);
    }
  });
});
