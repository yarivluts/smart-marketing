export type SentryRuntime = 'server' | 'edge' | 'client';

/**
 * The subset of Sentry.init()'s options this app sets. Kept as our own type
 * (rather than importing one of `@sentry/nextjs`'s runtime-specific Options
 * types) since that package only exposes those types per-runtime, not from
 * its shared entry point that both server and client code import here.
 */
export interface SentryInitOptions {
  dsn: string | undefined;
  environment: string;
  tracesSampleRate: number;
  debug: boolean;
  initialScope: { tags: Record<string, string> };
}

/**
 * Shared Sentry.init() config for all three Next.js runtimes (KAN-20). With no
 * DSN configured (local dev, CI, this sandbox) Sentry.init still runs but the
 * SDK is a no-op: nothing is sent over the network.
 */
export function sentryOptions(runtime: SentryRuntime): SentryInitOptions {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_GROWTHOS_ENV ?? 'dev',
    tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_DSN ? 1.0 : 0,
    debug: false,
    // Tag every event with which Next.js runtime produced it.
    initialScope: { tags: { runtime } },
  };
}
