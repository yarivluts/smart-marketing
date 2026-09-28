// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMemoryMediaStorage } from '@growthos/ad-studio';
import { parseByteRange, streamAdStudioMedia } from './media-response';

describe('parseByteRange', () => {
  it('reads start-end, open-ended and suffix ranges, clamps the end, and flags unsatisfiable ones', () => {
    expect(parseByteRange(null, 100)).toBeNull();
    expect(parseByteRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseByteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 });
    expect(parseByteRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=9-2', 100)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=0-1,5-6', 100)).toBeNull();
    expect(parseByteRange('items=0-1', 100)).toBeNull();
  });
});

describe('streamAdStudioMedia', () => {
  it('sends the whole object, a 206 partial with Content-Range, a 416, and a 404 for a missing object', async () => {
    const storage = createMemoryMediaStorage();
    await storage.upload('a/clip.mp4', Buffer.from('0123456789'), 'video/mp4');

    const whole = await streamAdStudioMedia(storage, 'a/clip.mp4', null);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect(whole.headers.get('cache-control')).toBe('private, no-store');
    expect(await whole.text()).toBe('0123456789');

    const partial = await streamAdStudioMedia(storage, 'a/clip.mp4', 'bytes=3-5');
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe('bytes 3-5/10');
    expect(partial.headers.get('content-length')).toBe('3');
    expect(await partial.text()).toBe('345');

    const unsatisfiable = await streamAdStudioMedia(storage, 'a/clip.mp4', 'bytes=20-');
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get('content-range')).toBe('bytes */10');

    expect((await streamAdStudioMedia(storage, 'a/missing.mp4', null)).status).toBe(404);
  });
});
