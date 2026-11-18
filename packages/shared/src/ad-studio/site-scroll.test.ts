import { describe, expect, it } from 'vitest';
import {
  AD_STUDIO_SITE_SCROLL_DEFAULT_SECONDS,
  formatHostAndPath,
  normalizeSitePageUrl,
  planSiteScrollInserts,
  rankCandidateSitePages,
} from './site-scroll';

describe('site-scroll shared helpers', () => {
  it('normalizes bare domains and upgrades http to https while rejecting credentials', () => {
    expect(normalizeSitePageUrl('example.com/courses#top')).toBe('https://example.com/courses');
    expect(normalizeSitePageUrl('http://shop.example.co.il/item')).toBe('https://shop.example.co.il/item');
    expect(normalizeSitePageUrl('https://user:pass@example.com')).toBeNull();
    expect(normalizeSitePageUrl('javascript:alert(1)')).toBeNull();
    expect(formatHostAndPath('https://example.com/')).toBe('example.com');
    expect(formatHostAndPath('https://example.com/products/crm/')).toBe('example.com/products/crm');
  });

  it('picks homepage plus the most ad-relevant Hebrew or English product pages and drops login/legal noise', () => {
    const hebrewGifted = '\u05DE\u05D7\u05D5\u05E0\u05E0\u05D9\u05DD';
    const hebrewPrep = '\u05D4\u05DB\u05E0\u05D4 \u05DC\u05DE\u05D1\u05D7\u05DF';
    const ranked = rankCandidateSitePages({
      startUrl: 'https://academy.co.il/',
      adName: `${hebrewPrep} ${hebrewGifted}`,
      productDescription: `${hebrewPrep} ${hebrewGifted} online practice`,
      objective: 'signups',
      links: [
        { url: 'https://academy.co.il/login', text: 'Login' },
        { url: 'https://academy.co.il/privacy-policy', text: 'Privacy' },
        { url: 'https://academy.co.il/contact', text: 'Contact us' },
        { url: 'https://academy.co.il/products/gifted-prep', text: `${hebrewPrep} ${hebrewGifted} track` },
        { url: 'https://academy.co.il/pricing', text: 'Pricing plans' },
        { url: 'https://external-site.com/ads', text: 'External ad' },
        { url: 'https://academy.co.il/brochure.pdf', text: 'PDF download' },
      ],
    });

    expect(ranked).toHaveLength(3);
    expect(ranked[0]).toMatchObject({ url: 'https://academy.co.il/', kind: 'home' });
    expect(ranked[1]).toMatchObject({ url: 'https://academy.co.il/products/gifted-prep', kind: 'product' });
    expect(ranked[2].url).toBe('https://academy.co.il/pricing');
  });

  it('includes the root homepage when the start URL is a product subpage', () => {
    const ranked = rankCandidateSitePages({
      startUrl: 'https://example.com/products/widget',
      adName: 'Widget Pro',
      productDescription: 'Automate your workflow with Widget Pro',
      objective: 'leads',
      links: [{ url: 'https://example.com/features', text: 'Widget Features' }],
    });

    expect(ranked.map((item) => [item.url, item.kind])).toEqual([
      ['https://example.com/products/widget', 'product'],
      ['https://example.com/', 'home'],
      ['https://example.com/features', 'product'],
    ]);
  });

  it('plans up to 2 selected scrolling inserts within the 60s ad cap', () => {
    const inserts = planSiteScrollInserts({
      pages: [
        { id: 'p1', durationSeconds: 0, selected: false },
        { id: 'p2', durationSeconds: AD_STUDIO_SITE_SCROLL_DEFAULT_SECONDS, selected: true },
        { id: 'p3', durationSeconds: 5, selected: true },
        { id: 'p4', durationSeconds: 4, selected: true },
      ],
      sceneSeconds: 53,
    });
    expect(inserts).toEqual([
      { pageId: 'p2', seconds: 4 },
      { pageId: 'p3', seconds: 3 },
    ]);
  });
});
