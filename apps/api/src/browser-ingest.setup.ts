import type { NestExpressApplication } from '@nestjs/platform-express';
import { browserIngestCors } from './ingest/browser-cors';

/**
 * What lets a web page call the ingest API directly with a publishable key: a text/plain body
 * parser (the only body `sendBeacon` sends without a preflight; the events route reads the JSON out
 * of it) and CORS on the two browser routes. Shared by `main.ts` and the e2e specs so both run the
 * same stack.
 */
export function configureBrowserIngest(app: NestExpressApplication): void {
  app.useBodyParser('text', { type: 'text/plain', limit: '1mb' });
  app.use(browserIngestCors);
}
