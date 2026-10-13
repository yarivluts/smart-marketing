import { describe, expect, it } from 'vitest';
import { normalizeSiteUrl, pickSiteLinks, siteHost } from './site';

const HOME = 'https://www.easysign.co.il/';

describe('pickSiteLinks', () => {
  it('keeps same-site pages, offer pages first, without the page itself, fragments, queries or repeats', () => {
    const html = `
      <a href="/blog/post-1">Blog</a>
      <a href="/about">About</a>
      <a href="https://easysign.co.il/pricing?utm=x#plans">Pricing</a>
      <a href='/services/lawyers'>Lawyers</a>
      <a href=/products/sign>Sign</a>
      <a href="#top">Top</a>
      <a href="/">Home</a>
      <a href="https://www.easysign.co.il/about/">About again</a>
      <a href="https://other.com/products">Elsewhere</a>`;
    expect(pickSiteLinks(html, HOME)).toEqual([
      'https://www.easysign.co.il/products/sign',
      'https://www.easysign.co.il/services/lawyers',
      'https://easysign.co.il/pricing',
      'https://www.easysign.co.il/about',
      'https://www.easysign.co.il/blog/post-1',
    ]);
  });

  it('skips accounts, legal, carts, media and non-web links, and reads Hebrew paths', () => {
    const html = `
      <a href="/login">Login</a><a href="/privacy-policy">Privacy</a><a href="/cart">Cart</a>
      <a href="/files/brochure.pdf">PDF</a><a href="mailto:a@b.co">Mail</a><a href="tel:+972">Call</a>
      <a href="javascript:void(0)">x</a><a href="https://wa.me/972">WhatsApp</a>
      <a href="/%D7%A9%D7%99%D7%A8%D7%95%D7%AA%D7%99%D7%9D">Services in Hebrew</a>
      <a href="/%E0%A4%A">Broken escape</a>`;
    const links = pickSiteLinks(html, HOME);
    expect(links[0]).toBe('https://www.easysign.co.il/%D7%A9%D7%99%D7%A8%D7%95%D7%AA%D7%99%D7%9D');
    expect(links).toHaveLength(2);
  });

  it('stops at the limit and returns nothing for a bad page URL', () => {
    const html = Array.from({ length: 20 }, (_, index) => `<a href="/p${index}">${index}</a>`).join('');
    expect(pickSiteLinks(html, HOME, 3)).toHaveLength(3);
    expect(pickSiteLinks(html, 'not a url')).toEqual([]);
  });
});

describe('normalizeSiteUrl', () => {
  it('turns what a person types into an https URL, and refuses what is not a site', () => {
    expect(normalizeSiteUrl(' easysign.co.il ')).toBe('https://easysign.co.il/');
    expect(normalizeSiteUrl('http://www.easysign.co.il/he#top')).toBe('https://www.easysign.co.il/he');
    expect(normalizeSiteUrl('')).toBeNull();
    expect(normalizeSiteUrl('not a site')).toBeNull();
    expect(normalizeSiteUrl('localhost')).toBeNull();
    expect(normalizeSiteUrl('ftp://easysign.co.il')).toBeNull();
    expect(normalizeSiteUrl('https://user:pass@easysign.co.il')).toBeNull();
  });

  it('names a site by its host', () => {
    expect(siteHost('https://www.easysign.co.il/he')).toBe('easysign.co.il');
    expect(siteHost('nope')).toBe('nope');
  });
});
