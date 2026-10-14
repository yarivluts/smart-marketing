import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// Ads are created "switched off" in Growth Pilot; the jargon words "paused" and
// "kill switch" must not come back into the sentences a newcomer reads about them.
const KEYS: string[] = ['activity.kind.ads_published', 'errors.automation_stopped', 'performance.noDelivery'];

function pick(messages: unknown, key: string): string {
  const parts = key.split('.');
  let node = (messages as { GrowthPilot: unknown }).GrowthPilot as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) node = node[part] as Record<string, unknown>;
  return node[parts[parts.length - 1]] as string;
}

describe('Growth Pilot plain copy', () => {
  it.each(KEYS)('english %s avoids "paused" and "kill switch"', (key) => {
    expect(pick(en, key)).not.toMatch(/paused|kill switch/i);
  });

  it.each(KEYS)('hebrew %s says the ads are switched off, not paused', (key) => {
    const text = pick(he, key);
    expect(text).not.toMatch(/מושה|מתג חירום/);
    expect(text.length).toBeGreaterThan(0);
  });
});
