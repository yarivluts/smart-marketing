import { describe, expect, it } from 'vitest';
import en from './en.json';

type Copy = Record<string, Record<string, string>>;

describe('Billing and Record feed: "Received" instead of "Landed"', () => {
  const keys: Array<[string, string]> = [
    ['BillingOpsFeed', 'landedAtLine'],
    ['BillingOpsFeed', 'capNoteTruncated'],
  ];

  it.each(keys)('%s.%s does not say "land"', (ns, key) => {
    const text = (en as unknown as Copy)[ns][key];
    expect(text).toBeTruthy();
    expect(text).not.toMatch(/\bland(s|ed)?\b/i);
  });

  it('every landedAtLine in English says "Received"', () => {
    const lines = Object.values(en as unknown as Copy)
      .map((ns) => ns.landedAtLine)
      .filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(line).toMatch(/^Received \{landedAt\}$/);
  });
});
