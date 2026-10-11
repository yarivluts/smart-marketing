/**
 * CORS for the routes a browser may call directly with a publishable key: sending events and
 * checking the installation. A preflight carries no key, so it is answered for any origin; the
 * actual request is where `ApiKeyAuthGuard` checks the key's allowed origins (and refuses every
 * other route a publishable key might try). No cookies are involved, so no credentials mode.
 */

export const BROWSER_INGEST_PATHS: ReadonlySet<string> = new Set(['/v1/ingest/events', '/v1/ingest/verify']);

export interface CorsRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface CorsResponse {
  setHeader(name: string, value: string): void;
  status(code: number): CorsResponse;
  end(): void;
}

function header(request: CorsRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Express middleware: CORS headers on the browser routes, and a 204 for their preflight. */
export function browserIngestCors(request: CorsRequest, response: CorsResponse, next: () => void): void {
  const origin = header(request, 'origin');
  if (!origin || !BROWSER_INGEST_PATHS.has(request.path.replace(/\/+$/, ''))) {
    next();
    return;
  }
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Max-Age', '86400');
    response.status(204).end();
    return;
  }
  next();
}
