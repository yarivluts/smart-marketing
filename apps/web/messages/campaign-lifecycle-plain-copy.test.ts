import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const HEBREW = /[֐-׿]/;

describe('the campaign progress steps speak plain words', () => {
  it('English avoids "sync" and "queryable"', () => {
    const text = JSON.stringify([en.Campaigns.lifecycle.sync, en.Campaigns.lifecycle.spend]);
    expect(text).not.toMatch(/sync|queryable/i);
    expect(en.Campaigns.lifecycle.sync.title).toBe('Results from the platform');
    expect(en.Campaigns.lifecycle.spend.unavailable).toBe('Not available yet');
  });

  it('Hebrew is Hebrew and avoids "סנכרון" and "שליפה"', () => {
    const { sync, spend } = he.Campaigns.lifecycle;
    for (const value of [sync.title, sync.done, sync.none, spend.unavailable]) {
      expect(value).toMatch(HEBREW);
      expect(value).not.toMatch(/סונכר|סנכרון|שליפה/);
    }
  });
});
