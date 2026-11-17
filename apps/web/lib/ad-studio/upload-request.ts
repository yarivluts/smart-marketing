import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { parseGallerySourceRef, type AdStudioGallerySourceRef } from '@growthos/shared';
import { parseJsonBody } from '@/lib/http/parse-json-body';

export interface ParsedMediaInput {
  upload?: { bytes: Buffer; fileName: string; label?: string; description?: string };
  source?: AdStudioGallerySourceRef;
  alsoSaveToGallery: boolean;
  fields: Record<string, string>;
}

/**
 * Parses either a `multipart/form-data` computer file upload or a JSON payload pointing at an
 * existing `source` gallery/walkthrough item. Enforces `maxFileBytes` before buffering into RAM.
 */
export async function readMediaUploadOrSource(
  request: NextRequest,
  options: { maxFileBytes: number; allowSource: boolean },
): Promise<{ data: ParsedMediaInput; error?: undefined } | { data?: undefined; error: NextResponse }> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { error: NextResponse.json({ error: 'invalid_request' }, { status: 400 }) };
    }
    const fields: Record<string, string> = {};
    let fileEntry: File | null = null;
    for (const [key, value] of form.entries()) {
      if (key === 'file' && value instanceof File) {
        fileEntry = value;
      } else if (typeof value === 'string') {
        fields[key] = value;
      }
    }
    if (!fileEntry) {
      return { error: NextResponse.json({ error: 'invalid_request' }, { status: 400 }) };
    }
    if (fileEntry.size > options.maxFileBytes) {
      return { error: NextResponse.json({ error: 'gallery_request', code: 'media_too_large' }, { status: 413 }) };
    }
    const bytes = Buffer.from(await fileEntry.arrayBuffer());
    return {
      data: {
        upload: {
          bytes,
          fileName: fileEntry.name || 'upload',
          label: fields.label,
          description: fields.description,
        },
        alsoSaveToGallery: fields.alsoSaveToGallery === 'true',
        fields,
      },
    };
  }

  if (!options.allowSource) {
    return { error: NextResponse.json({ error: 'invalid_request' }, { status: 400 }) };
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (parsed.error) return { error: parsed.error };
  const body = parsed.body;
  const source = parseGallerySourceRef(body?.source);
  if (!source) {
    return { error: NextResponse.json({ error: 'invalid_request' }, { status: 400 }) };
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(body ?? {})) {
    if (typeof value === 'string') fields[key] = value;
  }
  return {
    data: {
      source,
      alsoSaveToGallery: false,
      fields,
    },
  };
}
