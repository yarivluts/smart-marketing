import { describe, expect, it } from 'vitest';
import { EMPTY_AD_STUDIO_BRAND_KIT } from './brand-kit';
import { buildSiteEnrichmentPrompt, sanitizeSiteEnrichment } from './site-enrich';

describe('site enrichment prompt and sanitizer', () => {
  it('wraps landing page content as untrusted data and includes brand hints', () => {
    const prompt = buildSiteEnrichmentPrompt({
      pages: [
        {
          url: 'https://easysign.example',
          title: 'EasySign - Fast Digital Signatures',
          description: 'Send and sign contracts on WhatsApp',
          headings: ['Sign in seconds'],
          text: 'Built for law firms and businesses in Israel.',
        },
      ],
      brief: {
        name: 'EasySign Launch',
        objective: '',
        productDescription: '',
        language: 'he',
      },
      existingBrand: { ...EMPTY_AD_STUDIO_BRAND_KIT, brandName: 'EasySign' },
      detectedColors: ['#4f46e5'],
    });
    expect(prompt.system).toContain('Hebrew');
    expect(prompt.system).toContain('woman_warm');
    expect(prompt.system).toContain('Never invent facts');
    expect(prompt.user).toContain('<landing_page>');
    expect(prompt.user).toContain('Existing brand name: EasySign');
    expect(prompt.user).toContain('Brand colors detected in site CSS/HTML: #4f46e5');
  });

  it('sanitizes extracted colors, currency, voice preset, language, and caps lengths', () => {
    const clean = sanitizeSiteEnrichment({
      brandName: `  ${'B'.repeat(80)} `,
      slogan: `  ${'S'.repeat(90)} `,
      toneOfVoice: '  Warm and practical  ',
      colors: ['#3B82F6', '#abc', '#3b82f6', 'not-a-color', '#10b981', '#ef4444', '#f59e0b', '#0000ff'],
      productDescription: '  Digital signature platform  ',
      objective: '  Get free trial signups  ',
      currency: ' ils ',
      timezone: ' Asia/Jerusalem ',
      vertical: ' SaaS ',
      voicePreset: 'man_deep',
      language: 'HE',
    });
    expect(clean.brandName).toHaveLength(60);
    expect(clean.slogan).toHaveLength(70);
    expect(clean.toneOfVoice).toBe('Warm and practical');
    expect(clean.colors).toEqual(['#3b82f6', '#aabbcc', '#10b981', '#ef4444', '#f59e0b']);
    expect(clean.currency).toBe('ILS');
    expect(clean.timezone).toBe('Asia/Jerusalem');
    expect(clean.vertical).toBe('SaaS');
    expect(clean.voicePreset).toBe('man_deep');
    expect(clean.language).toBe('he');

    const bad = sanitizeSiteEnrichment({ currency: 'dollar', voicePreset: 'robot', language: '123', colors: null });
    expect(bad.currency).toBe('');
    expect(bad.voicePreset).toBe('');
    expect(bad.language).toBe('');
    expect(bad.colors).toEqual([]);
  });
});
