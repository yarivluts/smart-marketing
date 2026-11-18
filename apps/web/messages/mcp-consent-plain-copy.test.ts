import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('MCP consent screen speaks plainly', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    it(`avoids "cohorts"/"metrics" jargon and says nothing can be changed (${name})`, () => {
      const c = lang.McpConsent;
      const jargon = name === 'en' ? /cohort|metrics|query/i : /קבוצות עוקבים|מדדים/;
      expect(c.description).not.toMatch(jargon);
      expect(c.scopeReadDescription).not.toMatch(jargon);
      expect(c.description).toMatch(name === 'en' ? /cannot change anything/ : /לא יכולה לשנות דבר/);
    });
  }
});

describe('MCP consent screen titles and no-access line avoid developer words', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    it(`title, heading and no-access line have no "MCP" or permission codes (${name})`, () => {
      const c = lang.McpConsent;
      for (const text of [c.metaTitle, c.heading, c.noEligibleProjects]) {
        expect(text).not.toMatch(/MCP|mcp\.read/);
      }
      expect(c.heading).toMatch(name === 'en' ? /AI app/ : /אפליקציית AI/);
    });
  }
});
