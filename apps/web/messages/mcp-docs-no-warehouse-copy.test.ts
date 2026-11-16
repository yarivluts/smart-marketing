import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// The MCP guide told readers records "reach the warehouse in its hourly refresh"; a newcomer has no warehouse.
const body = (messages: unknown): string => JSON.stringify(messages).match(/"metricsBody":"((?:[^"\\]|\\.)*)"/)?.[1] ?? '';

describe('MCP guide metrics note', () => {
  it('en: says records show up in your reports within the hour, with no warehouse', () => {
    const text = body(en);
    expect(text).toContain('show up in your reports within the hour');
    expect(text.toLowerCase()).not.toContain('warehouse');
  });

  it('he: says records appear in your reports within the hour, with no מחסן', () => {
    const text = body(he);
    expect(text).toContain('מופיעות בדוחות שלכם תוך שעה');
    expect(text).not.toContain('מחסן');
  });
});
