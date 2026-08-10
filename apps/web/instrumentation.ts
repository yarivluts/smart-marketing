/**
 * Next.js server/edge instrumentation hook (KAN-20). Loads the runtime-
 * appropriate Sentry config before the rest of the app; see
 * `instrumentation-client.ts` for the browser side.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
