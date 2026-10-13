import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { canOverlayHeadline, HEADLINE_TOP, overlayHeadline } from './headline-overlay';

async function plain(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#8899aa' } }).png().toBuffer();
}

/** Mean brightness of a horizontal strip, as a share of the height. */
async function stripBrightness(bytes: Buffer, from: number, to: number): Promise<number> {
  const image = sharp(bytes);
  const { width = 0, height = 0 } = await image.metadata();
  const top = Math.round(height * from);
  // stats() reads the input, not the pipeline: cut the strip into its own buffer first.
  const strip = await image.clone().extract({ left: 0, top, width, height: Math.max(1, Math.round(height * to) - top) }).png().toBuffer();
  const { channels } = await sharp(strip).stats();
  return channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
}

describe('overlayHeadline', () => {
  it('sets a Hebrew headline with a number on the picture, same size, as a JPEG', async () => {
    const result = await overlayHeadline({ image: { bytes: await plain(800, 1000), mimeType: 'image/png' }, headline: '\u05d7\u05ea\u05de\u05d5 \u05ea\u05d5\u05da 30 \u05e9\u05e0\u05d9\u05d5\u05ea', format: 'portrait' });
    expect(result.mimeType).toBe('image/jpeg');
    expect(await sharp(result.bytes).metadata()).toMatchObject({ width: 800, height: 1000, format: 'jpeg' });
    // The headline band changes (gradient, white text); the bottom of the picture is untouched.
    const before = await stripBrightness(await plain(800, 1000), 0.04, 0.2);
    expect(Math.abs((await stripBrightness(result.bytes, 0.04, 0.2)) - before)).toBeGreaterThan(5);
    expect(Math.abs((await stripBrightness(result.bytes, 0.8, 1)) - before)).toBeLessThan(2);
  });

  it('keeps a story headline below the app bar, and escapes markup in the words', async () => {
    expect(HEADLINE_TOP.story).toBeGreaterThan(0.14);
    const result = await overlayHeadline({ image: { bytes: await plain(540, 960), mimeType: 'image/png' }, headline: 'Sign <fast> & free', format: 'story' });
    expect(await sharp(result.bytes).metadata()).toMatchObject({ width: 540, height: 960 });
  });

  it('is offered only for languages the font covers', () => {
    expect(canOverlayHeadline('he')).toBe(true);
    expect(canOverlayHeadline('EN')).toBe(true);
    expect(canOverlayHeadline('ru')).toBe(false);
    expect(canOverlayHeadline('ar')).toBe(false);
  });
});
