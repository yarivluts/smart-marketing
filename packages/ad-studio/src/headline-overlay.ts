import type { AdStudioImageFormat } from '@growthos/shared';
import { canTypesetLanguage, HEADLINE_TOP, setHeadline } from './ad-typography';
import type { AdStudioGeneratedImage } from './gemini-image';

/**
 * The studio's own headline, drawn in code over a text-free picture: image models misspell and
 * misorder words now and then (in Hebrew, a number inside the text can land on the wrong side), and a
 * retry is not guaranteed to fix it. The typesetting itself lives in ad-typography.ts; this keeps the
 * plain centred headline the last-resort render has always used.
 */

export { HEADLINE_TOP };

export function canOverlayHeadline(language: string): boolean {
  return canTypesetLanguage(language);
}

/** Draws `headline` centred across the upper part of the picture, in white with a shadow, over a darkening gradient. */
export function overlayHeadline(params: { image: AdStudioGeneratedImage; headline: string; format: AdStudioImageFormat }): Promise<AdStudioGeneratedImage> {
  return setHeadline({ ...params, language: 'en', layout: 'centered' });
}
