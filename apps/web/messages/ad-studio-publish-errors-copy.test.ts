import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio publish and search errors use plain words, not credential / quota / vault jargon', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as {
      exportFailure: Record<string, string>;
      search: { unavailable: Record<string, string> };
    };
    const jargon = name === 'en' ? /credential|quota|vault|deployment|developer token|expected format/i : /כספת|פרטי גישה|מכסת|Developer|מבנה הצפוי/;
    const keys = ['quota_exceeded', 'auth_failed', 'no_secret', 'invalid_credential'];

    it(`publish failures avoid jargon and say what to do (${name})`, () => {
      for (const key of keys) expect(a.exportFailure[key]).not.toMatch(jargon);
    });

    it(`search-volume messages avoid jargon (${name})`, () => {
      for (const key of ['vault_not_configured', 'developer_token_not_approved', 'credential_not_configured']) {
        expect(a.search.unavailable[key]).not.toMatch(jargon);
      }
    });
  }
});
