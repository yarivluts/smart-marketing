import * as Sentry from '@sentry/node';

export interface InitSentryOptions {
  environment?: string;
  release?: string;
}

/** Initializes Sentry when SENTRY_DSN is configured; returns whether it was enabled. */
export function initSentry(options: InitSentryOptions = {}): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: options.environment ?? process.env.GROWTHOS_ENV ?? 'dev',
    release: options.release,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
  return true;
}

export function isSentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

/** Reports an exception to Sentry, tagged with the active OTel trace id for correlation. */
export function captureException(error: unknown, tags: { traceId?: string } = {}): void {
  if (!isSentryEnabled()) return;

  Sentry.withScope((scope) => {
    if (tags.traceId) scope.setTag('trace_id', tags.traceId);
    Sentry.captureException(error);
  });
}
