import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// Ads are created "switched off" in Growth Pilot; the jargon words "paused" and
// "kill switch" must not come back into the sentences a newcomer reads about them.
const KEYS = [
  ['activity', 'kind', 'ads_published'],
  ['errors', 'automation_stopped'],
  ['performance', 'noDelivery'],
] as const;

function pick(messages: unknown, path: readonly string[]): string {
  let node = (messages as { GrowthPilot: unknown }).GrowthPilot as Record<string, unknown>;
  for (const part of path.slice(0, -1)) node = node[part] as Record<string, unknown>;
  return node[path[path.length - 1]] as string;
}

describe('Growth Pilot plain copy', () => {
  it.each(KEYS)('english %s.%s avoids "paused" and "kill switch"', (...path) => {
    expect(pick(en, path)).not.toMatch(/paused|kill switch/i);
  });

  it.each(KEYS)('hebrew %s.%s says the ads are switched off, not paused', (...path) => {
    const text = pick(he, path);
    expect(text).not.toMatch(/מושה|מתג חירום/);
    expect(text.length).toBeGreaterThan(0);
  });
});
