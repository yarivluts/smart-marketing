import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['noKeys', 'createKeyHeading', 'mcpApiKeyIntro', 'statusDescription'] as const;

describe('the access keys page speaks plainly', () => {
  it('English avoids "mint", "bearer token", "headless" and scope names', () => {
    for (const key of KEYS) {
      expect(en.ApiKeys[key]).not.toMatch(/mint|bearer|headless|mcp\.read/i);
    }
  });

  it('Hebrew avoids scope names and "טוקן", and the empty state says when a key is needed', () => {
    for (const key of KEYS) {
      expect(he.ApiKeys[key]).not.toMatch(/mcp\.read|טוקן/i);
    }
    expect(en.ApiKeys.noKeys).toMatch(/only need one/i);
    expect(he.ApiKeys.noKeys).toMatch(/רק אם/);
  });
});
