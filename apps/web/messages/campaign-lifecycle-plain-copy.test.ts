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

describe('the turn-on and platform steps speak plain words', () => {
  it('English avoids "activation" and "platform status"', () => {
    const { activation, live } = en.Campaigns.lifecycle;
    const text = JSON.stringify([activation, live.title]);
    expect(text).not.toMatch(/activat|status/i);
    expect(activation.pending).toBe('Waiting for you to turn it on');
    expect(live.title).toBe('On the ad platform');
  });

  it('Hebrew is Hebrew and avoids "סטטוס"', () => {
    const { activation, live } = he.Campaigns.lifecycle;
    for (const value of [activation.title, activation.none, activation.done, activation.pending, live.title]) {
      expect(value).toMatch(HEBREW);
      expect(value).not.toMatch(/סטטוס/);
    }
  });
});
