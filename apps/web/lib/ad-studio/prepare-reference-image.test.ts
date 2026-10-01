import { describe, expect, it, vi } from 'vitest';
import {
  canUploadAsIs,
  fitWithin,
  labelFromFileName,
  prepareReferenceImage,
  ReferenceImageUnreadableError,
  REFERENCE_UPLOAD_MAX_BYTES,
  type ImageCodec,
} from './prepare-reference-image';

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

function codec(
  sizes: number[],
  dimensions = { width: 4000, height: 3000 },
): ImageCodec & { encode: ReturnType<typeof vi.fn> } {
  return {
    decode: vi.fn(async () => ({ ...dimensions, source: {} as CanvasImageSource })),
    encode: vi.fn(async () => new Blob([new Uint8Array(sizes.shift() ?? 1)])),
  };
}

describe('preparing an image for the reference library', () => {
  it('sends a PNG or JPEG within 4 MB as it is', async () => {
    const png = file('logo.png', 'image/png', 1000);
    expect(canUploadAsIs(png)).toBe(true);
    expect(await prepareReferenceImage(png, codec([]))).toBe(png);
    expect(canUploadAsIs(file('big.jpg', 'image/jpeg', REFERENCE_UPLOAD_MAX_BYTES + 1))).toBe(
      false,
    );
    expect(canUploadAsIs(file('a.webp', 'image/webp', 10))).toBe(false);
  });

  it('turns a WebP or an over-size photo into a JPEG of at most 2560 px, lowering quality then size until it fits', async () => {
    const fake = codec([
      REFERENCE_UPLOAD_MAX_BYTES + 5,
      REFERENCE_UPLOAD_MAX_BYTES + 5,
      REFERENCE_UPLOAD_MAX_BYTES + 5,
      2000,
    ]);
    const result = await prepareReferenceImage(
      file('My_product-photo.webp', 'image/webp', 9_000_000),
      fake,
    );
    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('My product photo.jpg');
    expect(result.size).toBe(2000);
    const calls = fake.encode.mock.calls as unknown as [
      unknown,
      { width: number; height: number },
      number,
    ][];
    expect(
      calls.map(([, size, quality]) => [size.width, size.height, Number(quality.toFixed(2))]),
    ).toEqual([
      [2560, 1920, 0.9],
      [2560, 1920, 0.8],
      [2560, 1920, 0.7],
      [1920, 1440, 0.7],
    ]);
  });

  it('says so when the browser cannot read the file or it never fits', async () => {
    const unreadable: ImageCodec = {
      decode: async () => Promise.reject(new ReferenceImageUnreadableError()),
      encode: vi.fn(),
    };
    await expect(
      prepareReferenceImage(file('a.heic', 'image/heic', 10), unreadable),
    ).rejects.toBeInstanceOf(ReferenceImageUnreadableError);
    await expect(
      prepareReferenceImage(
        file('a.webp', 'image/webp', 10),
        codec(Array(6).fill(REFERENCE_UPLOAD_MAX_BYTES + 1)),
      ),
    ).rejects.toBeInstanceOf(ReferenceImageUnreadableError);
  });

  it('scales down only, and names an image from its file', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(labelFromFileName('  team__photo-2026.final.JPG ')).toBe('team photo 2026.final');
    expect(labelFromFileName(`${'x'.repeat(100)}.png`)).toHaveLength(80);
  });
});
