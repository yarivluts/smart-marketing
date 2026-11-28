import { AD_STUDIO_BRAND_LIMITS, type AdStudioBrandKit } from './brand-kit';
import { languageName, type AdStudioBriefInput, type AdStudioPrompt } from './prompts';
import { isAdStudioVoicePreset } from './voice';
import { NO_INVENTED_CLAIMS_RULE, UNTRUSTED_INPUT_RULE, wrapUntrusted } from './writing-rules';
import type { GrowthSitePage } from '../growth-pilot/analysis';

/**
 * Pure helpers for automatically reading a business's target website and extracting missing
 * project, brand kit, and brief fields/settings before creating ads.
 */

export interface AdStudioSiteEnrichment {
  brandName: string;
  slogan: string;
  toneOfVoice: string;
  colors: string[];
  productDescription: string;
  objective: string;
  currency: string;
  timezone: string;
  vertical: string;
  voicePreset: string;
  language: string;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const PAGE_TEXT_CAP = 2500;

function trimCap(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().toLowerCase();
  if (HEX_COLOR.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) {
    const [, r, g, b] = text;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

/**
 * Sanitizes model-extracted site enrichment fields against brand kit, brief, and project constraints.
 */
export function sanitizeSiteEnrichment(raw: unknown): AdStudioSiteEnrichment {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const colors = Array.isArray(input.colors)
    ? [...new Set(input.colors.map(normalizeHex).filter((color): color is string => color !== null))].slice(0, AD_STUDIO_BRAND_LIMITS.colors)
    : [];
  const rawCurrency = trimCap(input.currency, 8).toUpperCase();
  const rawVoice = trimCap(input.voicePreset, 40);
  const rawLang = trimCap(input.language, 10).toLowerCase();
  return {
    brandName: trimCap(input.brandName, AD_STUDIO_BRAND_LIMITS.brandName),
    slogan: trimCap(input.slogan, AD_STUDIO_BRAND_LIMITS.slogan),
    toneOfVoice: trimCap(input.toneOfVoice, AD_STUDIO_BRAND_LIMITS.toneOfVoice),
    colors,
    productDescription: trimCap(input.productDescription, 1500),
    objective: trimCap(input.objective, 500),
    currency: ISO_CURRENCY.test(rawCurrency) ? rawCurrency : '',
    timezone: trimCap(input.timezone, 80),
    vertical: trimCap(input.vertical, 80),
    voicePreset: isAdStudioVoicePreset(rawVoice) ? rawVoice : '',
    language: /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(rawLang) ? rawLang : '',
  };
}

/**
 * Builds a prompt asking the model to extract missing brand, project, and brief details strictly
 * from the crawled website pages without inventing facts.
 */
export function buildSiteEnrichmentPrompt(params: {
  pages: readonly GrowthSitePage[];
  brief: Pick<AdStudioBriefInput, 'name' | 'objective' | 'productDescription' | 'language'>;
  existingBrand: AdStudioBrandKit;
  detectedColors: readonly string[];
}): AdStudioPrompt {
  const adLang = languageName(params.brief.language || 'en');
  const pageText = params.pages
    .map((page, index) =>
      [
        `### Page ${index + 1}: ${page.url}`,
        page.title ? `Title: ${page.title}` : '',
        page.description ? `Description: ${page.description}` : '',
        page.headings.length ? `Headings: ${page.headings.join(' | ')}` : '',
        page.text ? `Text: ${page.text.slice(0, PAGE_TEXT_CAP)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');

  const existingSummary = [
    params.existingBrand.brandName ? `Existing brand name: ${params.existingBrand.brandName}` : null,
    params.existingBrand.slogan ? `Existing slogan: ${params.existingBrand.slogan}` : null,
    params.existingBrand.toneOfVoice ? `Existing tone of voice: ${params.existingBrand.toneOfVoice}` : null,
    params.existingBrand.colors.length ? `Existing brand colors: ${params.existingBrand.colors.join(', ')}` : null,
    params.detectedColors.length ? `Brand colors detected in site CSS/HTML: ${params.detectedColors.join(', ')}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return {
    system: [
      'You onboard a business into an advertising studio by reading its website and extracting brand, project, and ad brief details.',
      'Rules:',
      `- ${NO_INVENTED_CLAIMS_RULE}`,
      `- ${UNTRUSTED_INPUT_RULE}`,
      `- Write productDescription, objective, slogan, and toneOfVoice in ${adLang} (or the site language if unclear).`,
      `- brandName: exact business/brand name shown on the site (at most ${AD_STUDIO_BRAND_LIMITS.brandName} chars).`,
      `- slogan: concise brand tagline from the site, or a short factual summary line (at most ${AD_STUDIO_BRAND_LIMITS.slogan} chars).`,
      '- toneOfVoice: short practical description of the brand voice inferred from the site copy (e.g. "Warm, trustworthy, direct").',
      `- colors: up to ${AD_STUDIO_BRAND_LIMITS.colors} lowercase #rrggbb brand accent colors (prefer detected CSS/HTML colors when accurate).`,
      '- productDescription: clear summary of what the business sells, key capabilities, and target customers strictly from the site.',
      '- objective: concise advertising campaign goal fitting the product/service and brief.',
      '- currency: 3-letter ISO-4217 currency code matching the site market/pricing (e.g. ILS for Israeli Hebrew sites, USD for US sites, EUR for Eurozone); empty string if unclear.',
      '- timezone: valid IANA timezone matching the primary market (e.g. Asia/Jerusalem, America/New_York); empty string if unclear.',
      '- vertical: short industry/vertical label in English (e.g. "B2B SaaS", "Legal Tech", "Ecommerce"); empty string if unclear.',
      '- voicePreset: best narrator voice from woman_warm, woman_energetic, man_warm, man_deep, man_energetic.',
      '- language: 2-letter language code of the site (e.g. "he", "en").',
    ].join('\n'),
    user: [
      `Brief name: ${params.brief.name}`,
      params.brief.objective ? `Current objective: ${params.brief.objective}` : null,
      params.brief.productDescription ? `Current product description: ${params.brief.productDescription}` : null,
      `Ad language: ${adLang}`,
      existingSummary ? `\n${existingSummary}` : null,
      '',
      'Website content:',
      wrapUntrusted('landing_page', pageText),
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  };
}
