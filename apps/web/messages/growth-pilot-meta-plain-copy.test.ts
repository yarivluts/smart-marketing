import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const p = { en: en.GrowthPilot, he: he.GrowthPilot };

describe('Growth Pilot cards explain what "Meta" is the first time they say it', () => {
  it('names Facebook and Instagram next to Meta on the publish card and the missing-connection hints', () => {
    for (const text of [
      p.en.publish.description,
      p.en.publish.status.needs_meta,
      p.en.audience.metaMissing,
      p.en.performance.unavailableMeta,
    ]) {
      expect(text).toMatch(/Facebook and Instagram \(Meta\)/);
    }
    for (const text of [
      p.he.publish.description,
      p.he.publish.status.needs_meta,
      p.he.audience.metaMissing,
      p.he.performance.unavailableMeta,
    ]) {
      expect(text).toMatch(/פייסבוק ואינסטגרם \(Meta\)|פייסבוק ולאינסטגרם \(Meta\)/);
    }
  });

  it('the connect button says which accounts to connect, not just the brand', () => {
    expect(p.en.publish.status.connect).toBe('Connect Facebook and Instagram');
    expect(p.he.publish.status.connect).toMatch(/פייסבוק ואינסטגרם/);
  });
});
