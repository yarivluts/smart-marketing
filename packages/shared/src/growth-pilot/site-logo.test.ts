import { describe, expect, it } from 'vitest';
import { extractSiteColors, extractSiteLogoUrl, sanitizeSiteAnalysis } from './analysis';

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

describe('extractSiteColors', () => {
  it('extracts normalized brand colors from meta tags and CSS variables, skipping white/black/gray', () => {
    const html = `
      <meta name="theme-color" content="#3B82F6" />
      <meta name="msapplication-TileColor" content="#fff" />
      <style>
        :root {
          --primary-color: #1e40af;
          --brand-accent: #F90;
          --neutral-main: #e5e5e5;
          --dark-theme: #111111;
          --secondary: #10B981;
          --extra-brand: #6366f1;
          --another-accent: #ec4899;
        }
      </style>
    `;
    expect(extractSiteColors(html)).toEqual(['#3b82f6', '#1e40af', '#ff9900', '#10b981', '#6366f1']);
  });

  it('ignores non-hex values and handles empty HTML', () => {
    expect(extractSiteColors('<meta name="theme-color" content="rgb(0,0,0)"><style>:root{--primary: blue;}</style>')).toEqual([]);
  });
});
