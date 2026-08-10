/**
 * Sentry setup for the API (KAN-20). Must be imported before any other module
 * in `main.ts` so the SDK can patch http/express before they are required
 * elsewhere. `@sentry/nestjs` builds its tracing on OpenTelemetry, so this
 * also gives us http/express spans without running a second, competing
 * OpenTelemetry SDK.
 *
 * With no `SENTRY_DSN` set (local dev, CI, this sandbox) the SDK runs as a
 * no-op: `Sentry.init` still executes but nothing is sent over the network.
 */
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.GROWTHOS_ENV ?? 'dev',
  tracesSampleRate: process.env.SENTRY_DSN ? 1.0 : 0,
});
