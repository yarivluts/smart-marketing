import * as Sentry from '@sentry/node';
import { getCurrentTraceId } from './tracing';

let initialized = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || initialized) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.GROWTHOS_ENV ?? 'dev',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
  initialized = true;
}

export function isSentryEnabled(): boolean {
  return initialized;
}

/** Reports an error to Sentry (a no-op when SENTRY_DSN isn't configured) and returns the current trace id for correlation. */
export function captureExceptionWithTrace(error: unknown): string | undefined {
  const traceId = getCurrentTraceId();

  if (isSentryEnabled()) {
    Sentry.withScope((scope) => {
      if (traceId) {
        scope.setTag('trace_id', traceId);
      }
      Sentry.captureException(error);
    });
  }

  return traceId;
}

/** Test-only: clears the singleton init flag so each test can exercise initSentry() from a clean state. */
export function resetSentryForTests(): void {
  initialized = false;
}
