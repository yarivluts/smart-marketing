import { AD_STUDIO_REFERENCE_LABEL_MAX } from '@growthos/shared';

/** What the reference route accepts (Gemini Omni takes PNG and JPEG only). */
export const REFERENCE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg']);
/** The longest side a converted image keeps - sharper than any video frame Omni renders. */
export const REFERENCE_MAX_SIDE = 2560;

/** True when a file can be sent as it is: PNG or JPEG within the size limit. */
export function canUploadAsIs(file: Pick<File, 'type' | 'size'>): boolean {
  return ACCEPTED_TYPES.has(file.type) && file.size <= REFERENCE_UPLOAD_MAX_BYTES;
}

/** The size an image is drawn at: scaled down to fit `max` on its longest side, never up. */
export function fitWithin(
  width: number,
  height: number,
  max: number = REFERENCE_MAX_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A name for the image from its file name: no extension, separators as spaces, within the label limit. */
export function labelFromFileName(name: string): string {
  return name
    .trim()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AD_STUDIO_REFERENCE_LABEL_MAX);
}

export class ReferenceImageUnreadableError extends Error {
  constructor() {
    super('The browser could not read this image.');
    this.name = 'ReferenceImageUnreadableError';
  }
}

export interface ImageCodec {
  decode: (file: File) => Promise<{ width: number; height: number; source: CanvasImageSource }>;
  encode: (
    source: CanvasImageSource,
    size: { width: number; height: number },
    quality: number,
  ) => Promise<Blob>;
}

/** The browser's own decoder and a canvas JPEG encoder. */
export const browserImageCodec: ImageCodec = {
  async decode(file) {
    try {
      const bitmap = await createImageBitmap(file);
      return { width: bitmap.width, height: bitmap.height, source: bitmap };
    } catch {
      throw new ReferenceImageUnreadableError();
    }
  },
  async encode(source, size, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new ReferenceImageUnreadableError();
    // A white ground, so a transparent image does not turn black as a JPEG.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(source, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) throw new ReferenceImageUnreadableError();
    return blob;
  },
};

/**
 * Makes any image the browser can read uploadable: PNG/JPEG within 4 MB go as they are; anything
 * else (WebP, a large phone photo, ...) is drawn at most 2560 px on its longest side and saved as a
 * JPEG, lowering the quality and then the size until it fits. Throws `ReferenceImageUnreadableError`
 * for a file the browser cannot decode (e.g. HEIC outside Safari).
 */
export async function prepareReferenceImage(
  file: File,
  codec: ImageCodec = browserImageCodec,
): Promise<File> {
  if (canUploadAsIs(file)) return file;
  const decoded = await codec.decode(file);
  let size = fitWithin(decoded.width, decoded.height);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const quality = attempt < 3 ? 0.9 - attempt * 0.1 : 0.7;
    const blob = await codec.encode(decoded.source, size, quality);
    if (blob.size <= REFERENCE_UPLOAD_MAX_BYTES) {
      return new File([blob], `${labelFromFileName(file.name) || 'image'}.jpg`, {
        type: 'image/jpeg',
      });
    }
    if (attempt >= 2)
      size = fitWithin(
        size.width,
        size.height,
        Math.round(Math.max(size.width, size.height) * 0.75),
      );
  }
  throw new ReferenceImageUnreadableError();
}
