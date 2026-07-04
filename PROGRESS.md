# PROGRESS — GrowthOS run journal

Append a new dated entry at the **top** at the end of every run. Keep the template sections so a
fresh session can pick up work from this file + [TASKS.md](./TASKS.md) alone. See
[CLAUDE.md](./CLAUDE.md) for the rules.

Template for each entry:

```
## <date> — <run summary>
- **Last completed:** …
- **In progress (exact stopping point):** …
- **Blocked + why:** …
- **Next step:** …
- **Waiting on human:** …
```

---

## 2026-07-04 — E0.4 Observability baseline (KAN-20)

- **Last completed:**
  - Built the `apps/api` observability baseline in `apps/api/src/observability/`:
    - `tracing.ts` — OpenTelemetry `NodeSDK` bootstrap (http + express auto-instrumentation), started as the
      very first import in `main.ts` so instrumentation patches modules before anything else requires them.
      Exports OTLP HTTP trace exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, else falls back to a
      console exporter (no collector needed yet — GCP/observability infra is still `needs-human`, KAN-18).
    - `logger.ts` — structured JSON logs via `pino`, with a `mixin()` that injects the active OTel trace id
      onto every log line so logs and traces correlate.
    - `sentry.ts` — `initSentry()`/`captureExceptionWithTrace()`, gated on `SENTRY_DSN` (no-op until a human
      provisions a Sentry project); tags captured events with the OTel trace id.
    - `all-exceptions.filter.ts` — global Nest exception filter: logs every unhandled error with its trace id,
      reports to Sentry when configured, and returns `{ statusCode, message, traceId }` to the client.
  - Wired into `main.ts`: `startTracing()` first, `initSentry()`, `pino-http` request logging middleware,
    `app.useGlobalFilters(new AllExceptionsFilter())`.
  - Added `GET /health/live` (liveness) and `GET /health/ready` (readiness) to `HealthController` for
    external uptime checks (e.g. GCP Uptime Check once KAN-18 stands up the GCP project).
  - Verified end-to-end by booting the built API locally and curling `/v1/health`, `/v1/health/live`,
    `/v1/health/ready`, and an unknown route: structured JSON logs carried a real trace id per request, and
    the 404 response body included `traceId`. Sentry capture itself is unit-tested against a mocked SDK
    (no live DSN exists yet).
  - 17 new/updated tests added (`pnpm test` green), `pnpm build`, `pnpm typecheck`, `pnpm lint` all green
    across the monorepo. Opened PR from `feat/kan-20-observability-baseline`.
- **In progress (exact stopping point):** none — KAN-20 is fully delivered as scoped (app-level
  instrumentation). Actual GCP Uptime Check resource + Sentry project creation is infra/account work that
  belongs to KAN-18 (needs-human).
- **Blocked + why:** nothing blocking the next task.
- **Next step:** next run picks the next unblocked `todo` in sprint order from `TASKS.md` — sprint 1 has
  **KAN-21** (Firebase Auth), **KAN-22** (identity/RBAC firebase-orm models — seed already started in the
  bootstrap run), **KAN-23** (policy engine), **KAN-25** (org-scoped session UI), or **KAN-45** (i18n
  scaffold), in that table order, skipping `needs-human`/unfinished `blocked-by` items.
- **Waiting on human:**
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD, still open).
  - **KAN-18** — create GCP/Firebase projects + billing + secrets (also unblocks a real `SENTRY_DSN` and
    `OTEL_EXPORTER_OTLP_ENDPOINT` for this run's instrumentation, and preview/staging deploy for KAN-19).
  - Review/merge PR for KAN-20 (this run does not merge to `main`).

---

## 2026-07-04 — E0.0 Bootstrap (KAN-79)

- **Last completed:**
  - Initialized the GrowthOS pnpm/turbo monorepo (**KAN-17 / E0.1**): `apps/web` (Next.js App
    Router + TS + Tailwind + shadcn/ui), `apps/api` (NestJS), `packages/shared`,
    `packages/firebase-orm-models` (wraps `@arbel/firebase-orm`), plus `packages/eslint-config`.
  - `pnpm install`, `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint` all green locally
    (17 tests passing across 4 packages).
  - Added GitHub Actions CI (`.github/workflows/ci.yml`): install → lint → typecheck → test → build
    on every push/PR to `main` (partial **KAN-19 / E0.3** — preview + staging deploy still pending
    infra).
  - Wrote root `CLAUDE.md` (working rules), copied the 15 plan docs (+README) into `docs/plan/`,
    generated `TASKS.md` (mirrors KAN-17..KAN-78), and initialized this `PROGRESS.md`.
  - Seeded the identity/RBAC models (User, Organization, Membership, Project, Environment,
    RoleBinding, ServiceAccount) as the starting point for **KAN-22**.
- **In progress (exact stopping point):** none — bootstrap is a clean, self-contained stopping point.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** a human sets up the scheduled routine (see below), then the next run picks the first
  unblocked `todo` in sprint-1 order from `TASKS.md` — e.g. **KAN-45** (i18n scaffold) or **KAN-23**
  (policy engine), skipping `needs-human`/`blocked-by` items.
- **Waiting on human:**
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD, week 1).
  - **KAN-18** — create GCP/Firebase projects + billing + secrets.
  - Set up the scheduled routine (via `/schedule`) with the prompt:
    > Read PROGRESS.md and TASKS.md. Pick the next unblocked task (sprint order, respect blocked-by).
    > Implement it fully incl. tests per its AC. Branch + PR. Update PROGRESS.md. If a task exceeds one
    > run, stop at a clean point and document exactly where.

    Recommended cadence: every 1–2 hours during daytime (e.g. cron `0 8-22/2 * * *`), not more
    frequent, to avoid overlapping runs.
