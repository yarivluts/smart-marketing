import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Impact = { customer_profiles: { impact: string } };

function impactLine(messages: unknown): string {
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    const cp = rec.customer_profiles as Impact['customer_profiles'] | undefined;
    if (cp && typeof cp.impact === 'string') found.push(cp.impact);
    Object.values(rec).forEach(walk);
  };
  walk(messages);
  return found[0] ?? '';
}

describe('setup health: customer records impact line', () => {
  it('en calls them customer groups, like the menu', () => {
    const line = impactLine(en);
    expect(line).toMatch(/customer groups/);
    expect(line).not.toMatch(/segment/i);
  });

  it('he calls them customer groups, like the menu', () => {
    const line = impactLine(he);
    expect(line).toMatch(/קבוצות לקוחות/);
    expect(line).not.toMatch(/פלח/);
  });
});
