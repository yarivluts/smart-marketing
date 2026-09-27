import 'server-only';
import { Readable } from 'node:stream';
import type { AdStudioMediaStorage, MediaByteRange } from './media-storage';

/**
 * Streams a stored clip or video to the browser (KAN-231), honouring a single HTTP byte range so a
 * <video> element can seek and Safari can play it at all. Callers check permissions first; this
 * only reads the path the database recorded, never one taken from the request.
 */

/** A single `bytes=` range against an object of `size` bytes; null to send the whole object. */
export function parseByteRange(header: string | null, size: number): MediaByteRange | 'unsatisfiable' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  if (size === 0) return 'unsatisfiable';
  let start: number;
  let end: number;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

export async function streamAdStudioMedia(storage: AdStudioMediaStorage, objectPath: string, rangeHeader: string | null): Promise<Response> {
  const size = await storage.size(objectPath);
  if (size === null) return Response.json({ error: 'not_found' }, { status: 404 });
  const baseHeaders: Record<string, string> = {
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'content-disposition': 'inline',
    'x-content-type-options': 'nosniff',
  };
  const range = parseByteRange(rangeHeader, size);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...baseHeaders, 'content-range': `bytes */${size}` } });
  }
  const stream = Readable.toWeb(storage.read(objectPath, range ?? undefined)) as unknown as ReadableStream<Uint8Array>;
  if (!range) return new Response(stream, { status: 200, headers: { ...baseHeaders, 'content-length': String(size) } });
  return new Response(stream, {
    status: 206,
    headers: { ...baseHeaders, 'content-length': String(range.end - range.start + 1), 'content-range': `bytes ${range.start}-${range.end}/${size}` },
  });
}
