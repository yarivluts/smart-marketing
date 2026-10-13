import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { AdStudioImageFormat } from '@growthos/shared';
import { HEEBO_EXTRABOLD_TTF_BASE64 } from './fonts/heebo-extrabold';
import type { AdStudioGeneratedImage } from './gemini-image';

/**
 * The studio's own headline, drawn in code over a text-free picture. Image models misspell and
 * misorder words now and then - in Hebrew, a number inside the text can come out on the wrong side -
 * and a retry is not guaranteed to fix it. Drawn here, the headline is always exactly the words the
 * person wrote: libvips sets it with Pango, which applies the Unicode bidi algorithm, so right-to-left
 * text with digits reads correctly. A soft gradient behind it and a shadow keep it legible on any
 * picture. Used as the last resort after the guided retries, and only for languages the font covers.
 */

/** Ad languages Heebo covers (Hebrew and Latin scripts). */
const OVERLAY_LANGUAGES: ReadonlySet<string> = new Set(['he', 'en', 'es', 'fr', 'de', 'it', 'pt', 'nl']);

export function canOverlayHeadline(language: string): boolean {
  return OVERLAY_LANGUAGES.has(language.toLowerCase());
}

let fontPath: string | null = null;

/** libvips reads fonts from files: the embedded face is written once per process to a temp file named by its hash. */
function headlineFontFile(): string {
  if (fontPath && existsSync(fontPath)) return fontPath;
  const bytes = Buffer.from(HEEBO_EXTRABOLD_TTF_BASE64, 'base64');
  const path = join(tmpdir(), `growthos-heebo-extrabold-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.ttf`);
  if (!existsSync(path)) writeFileSync(path, bytes);
  fontPath = path;
  return path;
}

function escapeMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Where the headline starts, as a share of the height: stories keep clear of the app's own top bar. */
export const HEADLINE_TOP: Record<AdStudioImageFormat, number> = { square: 0.06, portrait: 0.06, story: 0.16, landscape: 0.07 };

/**
 * Draws `headline` across the upper part of the picture: up to 86% of the width, centred, in white
 * with a shadow, over a gradient that darkens the top of the picture. Returns a JPEG of the same size.
 */
export async function overlayHeadline(params: { image: AdStudioGeneratedImage; headline: string; format: AdStudioImageFormat }): Promise<AdStudioGeneratedImage> {
  const base = sharp(params.image.bytes);
  const { width = 1024, height = 1024 } = await base.metadata();
  const share = params.format === 'landscape' ? 0.055 : params.format === 'story' ? 0.09 : 0.075;
  const fontSize = Math.round(Math.min(width * share, height * 0.085));
  const textWidth = Math.round(width * 0.86);
  const render = (colour: string, alpha: string) =>
    sharp({
      text: {
        text: `<span foreground="${colour}" alpha="${alpha}">${escapeMarkup(params.headline.trim())}</span>`,
        font: `Heebo ExtraBold ${fontSize}`,
        fontfile: headlineFontFile(),
        width: textWidth,
        align: 'centre',
        wrap: 'word',
        rgba: true,
        dpi: 72,
      },
    })
      .png()
      .toBuffer({ resolveWithObject: true });
  const [text, shadow] = await Promise.all([render('white', '100%'), render('black', '60%')]);
  const blurred = await sharp(shadow.data).blur(Math.max(2, fontSize / 10)).png().toBuffer();
  const top = Math.round(height * HEADLINE_TOP[params.format]);
  const left = Math.max(0, Math.round((width - text.info.width) / 2));
  const shade = Math.min(height, top + text.info.height + Math.round(fontSize * 1.2));
  const gradient = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${shade}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="0.7" stop-color="#000" stop-opacity="0.28"/><stop offset="1" stop-color="#000" stop-opacity="0"/>` +
      `</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  const offset = Math.max(1, Math.round(fontSize / 24));
  const bytes = await base
    .composite([
      { input: gradient, top: 0, left: 0 },
      { input: blurred, top: top + offset, left: left + offset },
      { input: text.data, top, left },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
  return { bytes, mimeType: 'image/jpeg' };
}
