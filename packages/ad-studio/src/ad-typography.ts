import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  AD_STUDIO_BRAND_STRIP,
  splitHeadlineEmphasis,
  type AdStudioHeadlineLayout,
  type AdStudioImageFormat,
} from '@growthos/shared';
import { HEEBO_BLACK_TTF_BASE64 } from './fonts/heebo-black';
import { HEEBO_EXTRABOLD_TTF_BASE64 } from './fonts/heebo-extrabold';
import { HEEBO_LIGHT_TTF_BASE64 } from './fonts/heebo-light';
import { HEEBO_MEDIUM_TTF_BASE64 } from './fonts/heebo-medium';
import type { AdStudioGeneratedImage } from './gemini-image';

/**
 * The type the studio sets on an ad itself: the headline over a text-free picture, with the words
 * that sell set larger, heavier and in an accent colour, and the brand strip - logo, name, slogan -
 * every ad carries. Drawn with libvips/Pango, which applies the Unicode bidi algorithm, so Hebrew
 * with digits reads correctly, and every word is exactly as written.
 */

/** Ad languages Heebo covers (Hebrew and Latin scripts). */
const TYPESET_LANGUAGES: ReadonlySet<string> = new Set(['he', 'en', 'es', 'fr', 'de', 'it', 'pt', 'nl']);
const RTL_LANGUAGES: ReadonlySet<string> = new Set(['he', 'ar', 'fa', 'ur', 'yi']);

export function canTypesetLanguage(language: string): boolean {
  return TYPESET_LANGUAGES.has(language.toLowerCase());
}

export function isRtlLanguage(language: string): boolean {
  return RTL_LANGUAGES.has(language.toLowerCase());
}

const FACES = [
  { weight: 300, base64: HEEBO_LIGHT_TTF_BASE64 },
  { weight: 500, base64: HEEBO_MEDIUM_TTF_BASE64 },
  { weight: 800, base64: HEEBO_EXTRABOLD_TTF_BASE64 },
  { weight: 900, base64: HEEBO_BLACK_TTF_BASE64 },
] as const;

let fontFiles: string[] | null = null;
let registered: Promise<void> | null = null;

/** libvips reads fonts from files: each embedded face is written once per process to a temp file named by its hash. */
function headlineFontFiles(): string[] {
  if (fontFiles && fontFiles.every((path) => existsSync(path))) return fontFiles;
  fontFiles = FACES.map((face) => {
    const bytes = Buffer.from(face.base64, 'base64');
    const path = join(tmpdir(), `growthos-heebo-${face.weight}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.ttf`);
    if (!existsSync(path)) writeFileSync(path, bytes);
    return path;
  });
  return fontFiles;
}

/**
 * libvips adds a font file to the process's font configuration the first time a text render names it,
 * and keeps it: rendering once with each face makes every weight of "Heebo" available to markup.
 */
function registerFaces(): Promise<void> {
  if (!registered) {
    registered = (async () => {
      for (const fontfile of headlineFontFiles()) await sharp({ text: { text: '.', font: 'Heebo', fontfile, rgba: true } }).png().toBuffer();
    })().catch((error) => {
      registered = null;
      throw error;
    });
  }
  return registered;
}

function escapeMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A stretch of headline text in one size, weight and colour. */
export interface HeadlineRun {
  text: string;
  size: number;
  weight: 300 | 500 | 800 | 900;
  colour: string;
}
type Run = HeadlineRun;

/**
 * The distance between the baselines of a set headline's lines, as a share of the font size. Heebo's
 * own line height is about 1.48 em, which leaves wide gaps between the lines of a large headline; 1.1
 * keeps them tight and even without the lines touching. Set per span as an absolute Pango
 * `line_height` (Pango 1.50+), so a line is as tall as its largest run needs and no taller.
 */
export const HEADLINE_LEADING = 1.1;

/**
 * A Pango span per run; `colour` overrides every run's colour (for the shadow pass). `leading` sets
 * each run's line height as a share of its size (headlines); without it the font's own applies.
 */
function markup(runs: readonly Run[], colour?: string, alpha = '100%', leading?: number): string {
  return runs
    .map((run) => {
      const lineHeight = leading ? ` line_height="${Math.round(run.size * leading * 1024)}"` : '';
      return `<span font_family="Heebo" font_weight="${run.weight}" size="${Math.round(run.size * 1024)}"${lineHeight} foreground="${colour ?? run.colour}" alpha="${alpha}">${escapeMarkup(run.text)}</span>`;
    })
    .join('');
}

/**
 * Lines of runs as one Pango markup string. Empty lines are dropped, and each break between two lines
 * sits in a span of its own at the smaller of their sizes: a break never makes an empty line or lends
 * a large line height to a small one, so no gap opens between the lines.
 */
export function linesMarkup(lines: readonly (readonly Run[])[], colour?: string, alpha?: string): string {
  // A space between two emphasised phrases on one line is kept: it is what separates their words.
  const kept = lines.map((line) => line.filter((run) => run.text.length > 0)).filter((line) => line.some((run) => run.text.trim().length > 0));
  return kept
    .map((line, index) => {
      if (index === 0) return markup(line, colour, alpha, HEADLINE_LEADING);
      const previous = kept[index - 1];
      const size = Math.min(previous[previous.length - 1].size, line[0].size);
      const lineBreak = markup([{ text: '\n', size, weight: line[0].weight, colour: line[0].colour }], colour, alpha, HEADLINE_LEADING);
      return `${lineBreak}${markup(line, colour, alpha, HEADLINE_LEADING)}`;
    })
    .join('');
}

/**
 * The headline's runs, by line: emphasised phrases set larger, heavier and in the accent colour. In the
 * `stacked` layout every part is a line of its own (trimmed, the comma or dash that tied a part to an
 * emphasised phrase shed); otherwise the whole headline is one paragraph that wraps.
 */
export function headlineLines(params: { headline: string; emphasis?: readonly string[]; layout: AdStudioHeadlineLayout; fontSize: number; accent: string }): Run[][] {
  const { fontSize, accent } = params;
  const split = splitHeadlineEmphasis(params.headline, params.emphasis ?? []);
  if (!split.some((run) => run.emphasis)) return [[{ text: params.headline.trim(), size: fontSize, weight: 800, colour: 'white' }]];
  if (params.layout !== 'stacked') {
    // A no-break space keeps an emphasised phrase on one line.
    return [split.map((part) => (part.emphasis ? { text: keepTogether(part.text), size: fontSize * 1.4, weight: 900, colour: accent } : { text: part.text, size: fontSize * 0.9, weight: 300, colour: 'white' }))];
  }
  return split.map((part) =>
    part.emphasis
      ? [{ text: keepTogether(part.text.trim()), size: fontSize * 1.7, weight: 900, colour: accent }]
      : [{ text: trimJoiners(part.text), size: fontSize * 0.85, weight: 500, colour: 'white' }],
  );
}

/** Renders headline markup in Heebo on a transparent canvas `width` wide, as tall as the text. */
export async function renderHeadlineText(text: string, width: number, align: 'left' | 'centre' | 'right'): Promise<{ data: Buffer; info: sharp.OutputInfo }> {
  await registerFaces();
  // dpi 72: one point is one pixel, so the run sizes are pixel sizes.
  return sharp({ text: { text, width, align, wrap: 'word', rgba: true, dpi: 72, fontfile: headlineFontFiles()[2] } })
    .png()
    .toBuffer({ resolveWithObject: true });
}

/** Spaces inside a phrase become no-break spaces, so the line breaker never splits it. */
export function keepTogether(text: string): string {
  return text.replace(/ /g, ' ');
}

/** A run's leading and trailing spaces, commas, dashes and colons - the joints between it and an emphasised phrase. */
export function trimJoiners(text: string): string {
  return text.replace(/^[\s,;:\-–—]+/u, '').replace(/[\s,;:\-–—]+$/u, '');
}

/** Relative luminance of #rrggbb (0 black, 1 white). */
export function luminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0;
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** The colour the emphasised words take over the darkened top: the first brand colour bright enough to read there, else a warm yellow. */
export function headlineAccent(colors: readonly string[]): string {
  return colors.find((color) => luminance(color) >= 0.3) ?? '#ffd43b';
}

/** Where a set headline starts, as a share of the height: stories keep clear of the app's own top bar. */
export const HEADLINE_TOP: Record<AdStudioImageFormat, number> = { square: 0.06, portrait: 0.06, story: 0.16, landscape: 0.07 };

/**
 * Sets `headline` across the upper part of the picture over a gradient that darkens it, with a soft
 * shadow. Emphasised phrases are set larger, in the heaviest weight and the accent colour, the rest
 * lighter; `stacked` puts each emphasised phrase on its own line. Returns a JPEG of the same size.
 */
export async function setHeadline(params: {
  image: AdStudioGeneratedImage;
  headline: string;
  format: AdStudioImageFormat;
  language: string;
  emphasis?: readonly string[];
  layout?: AdStudioHeadlineLayout;
  accent?: string;
}): Promise<AdStudioGeneratedImage> {
  const base = sharp(params.image.bytes);
  const { width = 1024, height = 1024 } = await base.metadata();
  const layout = params.layout ?? 'centered';
  const share = params.format === 'landscape' ? 0.055 : params.format === 'story' ? 0.09 : 0.075;
  const fontSize = Math.min(width * share, height * 0.085);
  const rtl = isRtlLanguage(params.language);
  const lines = headlineLines({ headline: params.headline, emphasis: params.emphasis, layout, fontSize, accent: params.accent ?? '#ffd43b' });
  const text = (colour?: string, alpha?: string) => linesMarkup(lines, colour, alpha);
  const start = layout === 'start';
  const textWidth = Math.round(width * (start ? 0.7 : 0.86));
  // In a right-to-left paragraph Pango mirrors the alignment, so "left" is the reading side in both directions.
  const align = start ? 'left' : 'centre';
  const [fill, shadow] = await Promise.all([renderHeadlineText(text(), textWidth, align), renderHeadlineText(text('black', '60%'), textWidth, align)]);
  const blurred = await sharp(shadow.data).blur(Math.max(2, fontSize / 10)).png().toBuffer();
  const top = Math.round(height * HEADLINE_TOP[params.format]);
  const margin = Math.round(width * 0.07);
  const left = start ? (rtl ? Math.max(0, width - margin - fill.info.width) : margin) : Math.max(0, Math.round((width - fill.info.width) / 2));
  const shade = Math.min(height, top + fill.info.height + Math.round(fontSize * 1.2));
  const gradient = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${shade}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="0.7" stop-color="#000" stop-opacity="0.28"/><stop offset="1" stop-color="#000" stop-opacity="0"/>` +
      `</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  const offset = Math.max(1, Math.round(fontSize / 24));
  const bytes = await base
    .composite([
      { input: gradient, top: 0, left: 0 },
      { input: blurred, top: top + offset, left: Math.min(width - 1, left + offset) },
      { input: fill.data, top, left },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
  return { bytes, mimeType: 'image/jpeg' };
}

/** What the brand strip shows: the name always, the slogan and logo when the brand has them. */
export interface AdBrandMark {
  name: string;
  slogan: string;
  /** PNG or JPEG bytes of the logo; null without one. */
  logo: Buffer | null;
  /** Brand colours, most important first; the first one fills the strip. */
  colors: readonly string[];
  language: string;
}

/** The strip's fill and the text colour that reads on it. */
export function brandStripColours(colors: readonly string[]): { fill: string; text: string; muted: string } {
  const fill = colors[0] ?? '#111827';
  const light = luminance(fill) > 0.45;
  return { fill, text: light ? '#111111' : '#ffffff', muted: light ? '#333333' : '#e5e7eb' };
}

/**
 * Draws the brand strip over the band AD_STUDIO_BRAND_STRIP reserves for the placement: an opaque
 * band in the brand colour with the logo on a white tile at the reading side and, beside it, the
 * name in the heaviest weight over the slogan in a light one. Opaque, so a re-applied strip fully
 * covers whatever an edit left there. Returns a JPEG of the same size.
 */
export async function applyBrandStrip(params: { image: AdStudioGeneratedImage; format: AdStudioImageFormat; brand: AdBrandMark }): Promise<AdStudioGeneratedImage> {
  const base = sharp(params.image.bytes);
  const { width = 1024, height = 1024 } = await base.metadata();
  const layer = await brandStripLayer({ width, height, format: params.format, brand: params.brand });
  const bytes = await base.composite([{ input: layer, top: 0, left: 0 }]).jpeg({ quality: 92 }).toBuffer();
  return { bytes, mimeType: 'image/jpeg' };
}

/**
 * The brand strip alone, on a transparent canvas the size of the frame: a PNG laid over a picture, or
 * over every frame of a video ad (ffmpeg's overlay), so video ads carry the same strip as image ads.
 */
export async function brandStripLayer(params: {
  width: number;
  height: number;
  format: AdStudioImageFormat;
  brand: AdBrandMark;
  /** Where the strip sits, as shares of the height; default the placement's AD_STUDIO_BRAND_STRIP band. */
  zone?: { top: number; height: number };
  /** The band's opacity, 0-1; default 1 (opaque). A video banner lets the footage show through a little. */
  fillOpacity?: number;
}): Promise<Buffer> {
  const { width, height } = params;
  const zone = params.zone ?? AD_STUDIO_BRAND_STRIP[params.format];
  const stripHeight = Math.max(24, Math.round(height * zone.height));
  // A band that ends at the bottom edge ends exactly there, with no rounding gap below it.
  const top = Math.min(Math.round(height * zone.top), height - stripHeight);
  const colours = brandStripColours(params.brand.colors);
  const rtl = isRtlLanguage(params.brand.language);
  const padding = Math.round(stripHeight * 0.16);
  const tileSize = stripHeight - padding * 2;
  const gap = Math.round(stripHeight * 0.22);
  const opacity = Math.min(1, Math.max(0, params.fillOpacity ?? 1));
  const layers: sharp.OverlayOptions[] = [
    {
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${stripHeight}"><rect width="100%" height="100%" fill="${colours.fill}" fill-opacity="${opacity}"/></svg>`,
      ),
      top,
      left: 0,
    },
  ];

  let tile: Buffer | null = null;
  if (params.brand.logo) {
    try {
      const inner = Math.round(tileSize * 0.84);
      const logo = await sharp(params.brand.logo).resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
      const radius = Math.round(tileSize * 0.18);
      tile = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize}"><rect width="100%" height="100%" rx="${radius}" fill="#ffffff"/></svg>`))
        .composite([{ input: logo, gravity: 'centre' }])
        .png()
        .toBuffer();
    } catch {
      // An unreadable logo leaves the strip with the name and slogan only.
      tile = null;
    }
  }
  const sideMargin = Math.round(width * 0.04);
  const textLeftEdge = tile ? sideMargin + tileSize + gap : sideMargin;
  const textWidth = Math.max(40, width - textLeftEdge - sideMargin);
  const name = params.brand.name.trim();
  const slogan = params.brand.slogan.trim();
  const nameSize = stripHeight * (slogan ? 0.34 : 0.42);
  const sloganSize = stripHeight * 0.22;
  const runs: Run[] = [
    { text: name, size: nameSize, weight: 900, colour: colours.text },
    ...(slogan ? [{ text: `\n${slogan}`, size: sloganSize, weight: 300 as const, colour: colours.muted }] : []),
  ];
  const label = await renderHeadlineText(markup(runs), textWidth, 'left');
  // Too long for the strip: scale the text block down to fit its height.
  const maxTextHeight = stripHeight - padding;
  const textImage =
    label.info.height > maxTextHeight || label.info.width > textWidth
      ? await sharp(label.data).resize({ width: textWidth, height: maxTextHeight, fit: 'inside' }).png().toBuffer({ resolveWithObject: true })
      : label;
  const textTop = top + Math.round((stripHeight - textImage.info.height) / 2);
  if (rtl) {
    if (tile) layers.push({ input: tile, top: top + padding, left: width - sideMargin - tileSize });
    layers.push({ input: textImage.data, top: textTop, left: Math.max(0, width - textLeftEdge - textImage.info.width) });
  } else {
    if (tile) layers.push({ input: tile, top: top + padding, left: sideMargin });
    layers.push({ input: textImage.data, top: textTop, left: textLeftEdge });
  }
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .png()
    .toBuffer();
}
