import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { AD_STUDIO_BRAND_STRIP } from '@growthos/shared';
import {
  HEADLINE_LEADING,
  applyBrandStrip,
  brandStripColours,
  brandStripLayer,
  headlineAccent,
  headlineLines,
  keepTogether,
  linesMarkup,
  luminance,
  renderHeadlineText,
  setHeadline,
  trimJoiners,
} from './ad-typography';

async function picture(width: number, height: number, background = '#7a8f9e') {
  return { bytes: await sharp({ create: { width, height, channels: 3, background } }).png().toBuffer(), mimeType: 'image/png' };
}

async function pixel(bytes: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
}

const LOGO = sharp({ create: { width: 120, height: 120, channels: 3, background: '#ff0000' } }).png().toBuffer();

describe('ad typography', () => {
  it('reads colours: luminance, an accent that shows on a dark top, and strip text that reads on the fill', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 3);
    expect(luminance('#000000')).toBe(0);
    expect(headlineAccent(['#1e3a8a', '#fde047'])).toBe('#fde047');
    expect(headlineAccent(['#1e3a8a'])).toBe('#ffd43b');
    expect(brandStripColours(['#fde047']).text).toBe('#111111');
    expect(brandStripColours(['#1e3a8a']).text).toBe('#ffffff');
    expect(brandStripColours([]).fill).toBe('#111827');
  });

  it('keeps an emphasised phrase on one line and frees a stacked run from its joints', () => {
    expect(keepTogether('in 30 seconds')).toBe('in 30 seconds');
    expect(trimJoiners(', no printer ')).toBe('no printer');
    expect(trimJoiners('Sign in - ')).toBe('Sign in');
  });

  it('sets a headline with emphasis in every layout, keeping the picture size', async () => {
    for (const layout of ['centered', 'start', 'stacked'] as const) {
      const result = await setHeadline({ image: await picture(800, 1000), headline: 'Sign in 30 seconds, no printer', format: 'portrait', language: 'en', emphasis: ['30 seconds'], layout });
      const meta = await sharp(result.bytes).metadata();
      expect([meta.width, meta.height, result.mimeType]).toEqual([800, 1000, 'image/jpeg']);
    }
    const hebrew = await setHeadline({ image: await picture(800, 800), headline: 'חותמים בדקה', format: 'square', language: 'he', emphasis: ['בדקה'], layout: 'start' });
    expect((await sharp(hebrew.bytes).metadata()).width).toBe(800);
  });

  describe('headline line spacing', () => {
    const SIZE = 80;
    const ADJACENT = { headline: 'Fast secure signing for every lawyer', emphasis: ['Fast', 'secure'] };
    // "Fast and secure signature for every lawyer" in Hebrew, two emphasised words side by side (escapes: no Hebrew in code).
    const HEBREW = {
      headline: 'חתימה מהירה ומאובטחת לכל עורך דין',
      emphasis: ['מהירה', 'ומאובטחת'],
    };
    const lines = (input: { headline: string; emphasis: string[] }, layout: 'stacked' | 'centered' | 'start' = 'stacked') => headlineLines({ ...input, layout, fontSize: SIZE, accent: '#ffd43b' });

    it('builds a stacked headline as explicit lines: never two breaks in a row, none at either end', () => {
      for (const input of [ADJACENT, HEBREW, { headline: 'Sign in 30 seconds, no printer', emphasis: ['30 seconds'] }, { headline: 'Fast, secure', emphasis: ['Fast', 'secure'] }]) {
        const text = linesMarkup(lines(input));
        expect(text).not.toMatch(/\n\s*(<[^>]+>\s*)*\n/);
        expect(text.startsWith('<span')).toBe(true);
        expect(text).not.toMatch(/^(<span[^>]*>)\n/);
        expect(text).not.toMatch(/\n<\/span>$/);
      }
      // Each part on a line of its own; the joint between two emphasised words dropped.
      expect(linesMarkup(lines(ADJACENT)).split('\n')).toHaveLength(3);
      // Every break sits in a span no larger than the smaller of the two lines it separates.
      const breaks = [...linesMarkup(lines(ADJACENT)).matchAll(/size="(\d+)"[^>]*>\n</g)].map((match) => Number(match[1]) / 1024);
      expect(breaks.map((size) => Math.round(size))).toEqual([Math.round(SIZE * 1.7), Math.round(SIZE * 0.85)]);
      // Every span sets a tight line height for its size.
      expect(linesMarkup(lines(ADJACENT))).toContain(`line_height="${Math.round(SIZE * 1.7 * HEADLINE_LEADING * 1024)}"`);
    });

    it('keeps the space between two emphasised words on one line', () => {
      const text = linesMarkup(lines(ADJACENT, 'centered'));
      expect(text).not.toContain('\n');
      expect(text).toMatch(/>Fast<\/span><span[^>]*> <\/span><span[^>]*>secure</);
    });

    it('renders a stacked headline with two adjacent emphasised phrases without a gap between the lines', async () => {
      for (const input of [ADJACENT, HEBREW]) {
        // The joint between the two emphasised phrases is an empty line, which is never set.
        const parts = lines(input).filter((line) => line.some((run) => run.text.trim()));
        const rendered = await renderHeadlineText(linesMarkup(parts), 900, 'centre');
        // Every line at its own size, at most 1.3 times that size apart: no empty line, no loose leading.
        const bound = parts.reduce((sum, line) => sum + Math.max(...line.map((run) => run.size)), 0) * 1.3;
        expect(parts.length).toBe(input === ADJACENT ? 3 : 4);
        expect(rendered.info.height).toBeLessThanOrEqual(bound);
        expect(rendered.info.height).toBeGreaterThan(bound / 2);
      }
    });
  });

  it('covers the reserved band with an opaque strip in the brand colour, logo at the reading side', async () => {
    const width = 1000;
    const height = 1000;
    const zone = AD_STUDIO_BRAND_STRIP.square;
    const brand = { name: 'EasySign', slogan: 'Sign anywhere', logo: await LOGO, colors: ['#1e3a8a'], language: 'en' };
    const result = await applyBrandStrip({ image: await picture(width, height), format: 'square', brand });
    const stripTop = Math.round(height * zone.top);
    // The far end of the strip is the brand colour, above it the picture is untouched.
    const [r, g, b] = await pixel(result.bytes, width - 5, stripTop + 5);
    expect(Math.abs(r - 0x1e) + Math.abs(g - 0x3a) + Math.abs(b - 0x8a)).toBeLessThan(30);
    const [pr] = await pixel(result.bytes, width / 2, stripTop - 20);
    expect(Math.abs(pr - 0x7a)).toBeLessThan(10);
    // The logo (red) sits at the left in a left-to-right ad and at the right in a Hebrew one.
    const tileY = stripTop + Math.round((height * zone.height) / 2);
    const left = await pixel(result.bytes, Math.round(width * 0.04) + 30, tileY);
    expect(left[0]).toBeGreaterThan(200);
    expect(left[1]).toBeLessThan(60);
    const rtl = await applyBrandStrip({ image: await picture(width, height), format: 'square', brand: { ...brand, language: 'he' } });
    const right = await pixel(rtl.bytes, width - Math.round(width * 0.04) - 30, tileY);
    expect(right[0]).toBeGreaterThan(200);
    expect(right[1]).toBeLessThan(60);
  });

  it('draws the strip without a logo or slogan, and survives an unreadable logo', async () => {
    const result = await applyBrandStrip({ image: await picture(600, 600), format: 'square', brand: { name: 'EasySign', slogan: '', logo: Buffer.from('not an image'), colors: [], language: 'en' } });
    expect((await sharp(result.bytes).metadata()).height).toBe(600);
  });

  it('makes a transparent frame-sized layer for video, opaque only in the strip band', async () => {
    const layer = await brandStripLayer({ width: 720, height: 1280, format: 'story', brand: { name: 'EasySign', slogan: 'Sign anywhere', logo: null, colors: ['#1e3a8a'], language: 'en' } });
    const { data, info } = await sharp(layer).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([720, 1280, 4]);
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alpha(10, 100)).toBe(0);
    expect(alpha(710, Math.round(1280 * (AD_STUDIO_BRAND_STRIP.story.top + 0.01)))).toBe(255);
  });
});
