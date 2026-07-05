import { NextResponse, type NextRequest } from 'next/server';

export type ParsedJsonBody<T> = { body: T; error?: undefined } | { body?: undefined; error: NextResponse };

/**
 * Parses a request's JSON body without throwing — every mutating org/invite
 * route handler needs this exact `try { request.json() } catch { 400 }`
 * step before its own field validation.
 */
export async function parseJsonBody<T>(request: NextRequest): Promise<ParsedJsonBody<T>> {
  try {
    return { body: (await request.json()) as T };
  } catch {
    return { error: NextResponse.json({ error: 'invalid_json' }, { status: 400 }) };
  }
}
