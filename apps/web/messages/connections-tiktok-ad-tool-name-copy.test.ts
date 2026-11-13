import { describe, expect, it } from 'vitest';
import en from './en.json';

// A newcomer does not know "Ads Manager" is TikTok's tool: the first mention says so.
describe('connections help introduces TikTok Ads Manager as TikTok\'s ad tool', () => {
  const json = JSON.stringify(en);
  it('names the tool where the advertiser ID is asked for', () => {
    expect(json).toContain("In TikTok's ad tool (TikTok Ads Manager): the account menu");
    expect(json).toContain("Copy your advertiser ID from TikTok's ad tool (TikTok Ads Manager).");
  });
  it('no longer mentions the bare tool name', () => {
    expect(json).not.toContain('In TikTok Ads Manager:');
    expect(json).not.toContain('from TikTok Ads Manager.');
  });
});
