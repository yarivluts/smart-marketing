import { describe, expect, it } from 'vitest';
import { extractSiteLogoUrl, sanitizeSiteAnalysis } from './analysis';

const PAGE = 'https://easysign.example/he/';

describe('extractSiteLogoUrl', () => {
  it('prefers the structured-data logo, as an absolute https URL', () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","logo":{"@type":"ImageObject","url":"/img/brand.png"}}</script><img class="site-logo" src="/x.png">`;
    expect(extractSiteLogoUrl(html, PAGE)).toBe('https://easysign.example/img/brand.png');
    expect(extractSiteLogoUrl('{"logo": "http://cdn.example/logo.svg"}', PAGE)).toBe('https://cdn.example/logo.svg');
  });

  it('falls back to an image the page calls a logo, then the touch icon, then a PNG or SVG favicon', () => {
    expect(extractSiteLogoUrl(`<img src="/hero.jpg" alt="Team"><img alt='EasySign logo' src='assets/es.png'>`, PAGE)).toBe('https://easysign.example/he/assets/es.png');
    expect(extractSiteLogoUrl(`<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="/touch.png">`, PAGE)).toBe('https://easysign.example/touch.png');
    expect(extractSiteLogoUrl(`<link rel="shortcut icon" href="/favicon.ico"><link rel="icon" type="image/png" href="/icon-192.png?v=2">`, PAGE)).toBe('https://easysign.example/icon-192.png?v=2');
  });

  it('finds nothing in a page with only an .ico, a data URL logo or no logo at all', () => {
    expect(extractSiteLogoUrl(`<link rel="icon" href="/favicon.ico">`, PAGE)).toBeNull();
    expect(extractSiteLogoUrl(`<img class="logo" src="data:image/png;base64,AAAA">`, PAGE)).toBeNull();
    expect(extractSiteLogoUrl('<p>Hello</p>', PAGE)).toBeNull();
  });
});

describe('site analysis slogan', () => {
  it('keeps a trimmed slogan within the brand kit limit', () => {
    const analysis = sanitizeSiteAnalysis({ businessName: 'EasySign', slogan: `  ${'s'.repeat(90)} `, summary: 'x', language: 'he', offerings: [], audiences: [] });
    expect(analysis.slogan).toHaveLength(70);
    expect(sanitizeSiteAnalysis({ businessName: 'EasySign', summary: 'x', language: 'he', offerings: [], audiences: [] }).slogan).toBe('');
  });
});
