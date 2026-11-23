import { describe, expect, it } from 'vitest';
import he from './he.json';

describe('Hebrew ad button names speak to everyone, like the rest of the app', () => {
  it('uses plural imperatives instead of masculine-only singular ones', () => {
    const cta = (he as { Campaigns: { cta: Record<string, string> } }).Campaigns.cta;
    expect(cta.shop_now).toBe('קנו עכשיו');
    expect(cta.contact_us).toBe('צרו קשר');
    expect(cta.apply_now).toBe('הגישו מועמדות');
    expect(cta.book_travel).toBe('הזמינו עכשיו');
  });
});
