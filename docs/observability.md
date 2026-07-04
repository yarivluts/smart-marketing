# Observability baseline (KAN-20 / E0.4)

Code-level baseline for tracing, structured logs, and error tracking across `apps/api` and
`apps/web`. Provisioning the actual Sentry project and an external uptime monitor requires
accounts/secrets and is tracked in the human-action queue (see [TASKS.md](../TASKS.md)) — everything
below works today with those env vars unset; it just runs as a no-op.

## Structured logs

`@growthos/shared` exports `createLogger(service)` (built on [pino](https://getpino.io)): every call
emits one JSON line to stdout, tagged with `service` and, when called inside `runWithTraceId`, a
`trace_id` field. `LOG_LEVEL` (default `info`) controls verbosity.

## Trace id propagation

`@growthos/shared` also exports `generateTraceId` / `runWithTraceId` / `getTraceId`, built on
`node:async_hooks`. In `apps/api`, `TraceMiddleware` (`src/observability/trace.middleware.ts`) runs on
every request: it reuses an incoming `x-request-id` header or mints a new id, binds it for the
lifetime of the request, tags the active Sentry scope with it, and echoes it back as the
`x-trace-id` response header. `AllExceptionsFilter` (`src/common/all-exceptions.filter.ts`) logs every
unhandled exception with that same id and returns it in the JSON error body, so a user-reported error
can be traced straight to the matching log line and Sentry event.

## Error tracking (Sentry)

- **api**: `@sentry/nestjs`. `src/instrument.ts` calls `Sentry.init` and is imported before anything
  else in `main.ts` (required so the SDK can patch `http`/`express`). `@sentry/nestjs`'s tracing is
  built on OpenTelemetry, so this also gives us http/express spans without running a second,
  independent OpenTelemetry SDK. `AllExceptionsFilter#catch` is decorated with
  `@SentryExceptionCaptured()`, reporting every unhandled exception.
- **web**: `@sentry/nextjs`, wired through the standard Next.js hooks: `instrumentation.ts` (server +
  edge) and `instrumentation-client.ts` (browser), each calling `Sentry.init` via the shared
  `sentryOptions()` helper in `lib/observability/sentry-options.ts`. `app/global-error.tsx` reports
  any error that escapes every other React error boundary.

### Required env vars (set these once a Sentry project exists — KAN-18/human queue)

| Var                                         | Where    | Purpose                                                             |
| ------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `SENTRY_DSN`                                | apps/api | api error/trace ingestion. Unset = SDK no-ops.                      |
| `NEXT_PUBLIC_SENTRY_DSN`                    | apps/web | web (server+edge+client) error/trace ingestion. Unset = SDK no-ops. |
| `GROWTHOS_ENV` / `NEXT_PUBLIC_GROWTHOS_ENV` | both     | tags events with `dev`/`staging`/`prod`.                            |
| `LOG_LEVEL`                                 | api      | pino log level, default `info`.                                     |

## Uptime checks

`GET /v1/health` (`apps/api/src/health`) is the uptime-check target: it returns `200` with
`{ status: 'ok', service, environment, environments, uptimeSeconds }`. Once GCP infra exists
(KAN-18), point a GCP Uptime Check (or an external monitor) at this endpoint per environment. Wiring
that monitor up is infra/human work, not app code, and is tracked alongside KAN-18/KAN-20 in
TASKS.md.
