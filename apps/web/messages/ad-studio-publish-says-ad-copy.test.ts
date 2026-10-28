import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const publishCopy = (m: typeof en) => [
  m.AdStudio.publish.campaignName,
  m.AdStudio.publish.euLegend,
  m.AdStudio.publish.searchNote,
  m.AdStudio.invalidReason.campaignName,
];

describe('the Ad Studio publish step calls the thing being made an "ad"', () => {
  it('English publish copy never says campaign', () => {
    for (const text of publishCopy(en)) expect(text).not.toMatch(/campaign/i);
  });

  it('Hebrew publish copy never says קמפיין', () => {
    for (const text of publishCopy(he as typeof en)) expect(text).not.toMatch(/קמפיין/);
  });

  it('labels the name field "Ad name"', () => {
    expect(en.AdStudio.publish.campaignName).toBe('Ad name');
    expect(he.AdStudio.publish.campaignName).toBe('שם המודעה');
  });
});
