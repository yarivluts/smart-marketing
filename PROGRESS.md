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
  - `@growthos/shared`: structured JSON logging (`createLogger`, built on pino) and async-local
    trace id propagation (`generateTraceId` / `runWithTraceId` / `getTraceId`, built on
    `node:async_hooks`), each with unit tests.
  - `apps/api`: `@sentry/nestjs` wired via `src/instrument.ts` (imported first in `main.ts`, before
    any other module, as required for it to patch http/express). `TraceMiddleware` binds one trace
    id per request, tags the active Sentry scope with it, and echoes it back as `x-trace-id`.
    `AllExceptionsFilter` (global `@Catch()`, `@SentryExceptionCaptured()`) logs every unhandled
    exception with structured JSON (including the trace id) and reports it to Sentry — so the same
    id ties together the log line, the Sentry event, and the client-visible response. `@sentry/nestjs`
    builds its tracing on OpenTelemetry, so this covers the "OpenTelemetry in api" AC without running
    a second, competing OpenTelemetry SDK. `/v1/health` now also reports `uptimeSeconds`.
  - `apps/web`: `@sentry/nextjs` wired through the standard Next.js hooks — `instrumentation.ts`
    (server + edge) and `instrumentation-client.ts` (browser) — via a shared `sentryOptions()`
    helper, plus `app/global-error.tsx` to report anything that escapes every other React error
    boundary. Deliberately skipped `withSentryConfig`/source-map upload (needs a Sentry auth token
    we don't have yet); runtime error capture doesn't need it.
  - Verified end-to-end by running the built api locally: hitting a 404 (and a thrown exception in
    tests) produces the same trace id in the `x-trace-id` response header, the JSON error body, and
    the structured log line.
  - Wrote `docs/observability.md` (setup, required env vars, how uptime checks plug in once GCP
    exists). `pnpm build && pnpm test && pnpm lint && pnpm typecheck` all green.
  - Marked KAN-20 `in-progress` in TASKS.md (code baseline done; live Sentry project + DSN secrets +
    GCP Uptime Check still need a human — added to the human-action queue) and opened a PR.
- **In progress (exact stopping point):** none — this is a clean, self-contained stopping point.
  No admin UI was added: this story is ops/infra configuration (env vars, SDK wiring), not data a
  human manages through the product.
- **Blocked + why:** nothing blocking the next code task. The remaining sliver of KAN-20 (an actual
  Sentry project + a live uptime monitor) needs GCP/Sentry accounts (KAN-18-adjacent), not code.
- **Next step:** next run picks the next unblocked `todo` in TASKS.md sprint order — e.g. **KAN-21**
  (Firebase Auth integration) or **KAN-45** (i18n scaffold), skipping `needs-human`/`blocked-by`
  items.
- **Waiting on human:**
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD, week 1).
  - **KAN-18** — create GCP/Firebase projects + billing + secrets.
  - **KAN-20** — create a Sentry project + set `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` secrets; once
    GCP exists, point a GCP Uptime Check at `GET /v1/health`.
  - Review/merge the KAN-20 PR (this run does not merge to `main`).

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
