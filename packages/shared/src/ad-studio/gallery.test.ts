import { describe, expect, it } from 'vitest';
import { galleryLabelFromFileName, isWebpBytes, parseGallerySourceRef, sniffVideoContainer } from './gallery';

describe('sniffVideoContainer', () => {
  it('identifies MP4, QuickTime MOV, and WebM headers and rejects non-video bytes', () => {
    const mp4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
    const mov = Buffer.from([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]);
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

    expect(sniffVideoContainer(mp4)).toBe('video/mp4');
    expect(sniffVideoContainer(mov)).toBe('video/quicktime');
    expect(sniffVideoContainer(webm)).toBe('video/webm');
    expect(sniffVideoContainer(png)).toBeNull();
    expect(sniffVideoContainer(Buffer.from('not-video'))).toBeNull();
  });

  it('detects RIFF WEBP images and formats clean default labels from filenames', () => {
    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    expect(isWebpBytes(webp)).toBe(true);
    expect(isWebpBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(galleryLabelFromFileName('product_hero-clip.final.mp4')).toBe('product hero clip.final');
  });
});

describe('parseGallerySourceRef', () => {
  it('parses every supported gallery source ref shape and rejects malformed inputs', () => {
    expect(parseGallerySourceRef({ type: 'gallery', assetId: 'g1' })).toEqual({ type: 'gallery', assetId: 'g1' });
    expect(parseGallerySourceRef({ type: 'demo_segment', recordingId: 'r1', segmentId: 's1' })).toEqual({ type: 'demo_segment', recordingId: 'r1', segmentId: 's1' });
    expect(parseGallerySourceRef({ type: 'brief_reference', briefId: 'b1', referenceId: 'ref1' })).toEqual({ type: 'brief_reference', briefId: 'b1', referenceId: 'ref1' });
    expect(parseGallerySourceRef({ type: 'brief_image', briefId: 'b1', imageId: 'img1' })).toEqual({ type: 'brief_image', briefId: 'b1', imageId: 'img1' });
    expect(parseGallerySourceRef({ type: 'brief_clip', briefId: 'b1', clipId: 'clip1' })).toEqual({ type: 'brief_clip', briefId: 'b1', clipId: 'clip1' });

    expect(parseGallerySourceRef(null)).toBeNull();
    expect(parseGallerySourceRef([])).toBeNull();
    expect(parseGallerySourceRef({ type: 'gallery', assetId: '' })).toBeNull();
    expect(parseGallerySourceRef({ type: 'demo_segment', recordingId: 'r1' })).toBeNull();
    expect(parseGallerySourceRef({ type: 'unknown', id: '1' })).toBeNull();
  });
});
