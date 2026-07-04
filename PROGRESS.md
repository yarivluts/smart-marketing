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

## 2026-07-04 — E1.4 Authz middleware (KAN-24)

- **Last completed:**
  - Implemented **KAN-24** (authz middleware/decorator + client permission gate hooks), the natural
    follow-on to KAN-23 (policy engine, merged earlier today):
    - `apps/api/src/authz/`: `@RequirePermission(permission)` / `@Public()` decorators; `PermissionGuard`
      wired globally via `APP_GUARD`, evaluating `can()` from `@growthos/shared/policy` against
      `request.principal` / `request.bindings`. Method-level annotations take precedence over
      class-level ones (a controller can be `@Public()` by default and still lock one route down, or
      vice versa). A route with **neither** annotation denies outright at runtime (fail-closed), not
      just at lint time.
    - `apps/api/eslint.config.mjs`: a custom `growthos/require-permission-annotation` rule fails the
      build if any NestJS route handler — `@Get() foo() {}` or the arrow-function class-field style
      `@Get() foo = () => {}` — lacks the annotation on itself or its controller. This is the "no route
      reachable without explicit permission annotation" AC.
    - `HealthController` marked `@Public()` (uptime probes have no principal).
    - `apps/web/lib/permissions/`: `PermissionProvider` + `usePermission(permission, resource)` run the
      identical `can()` evaluation client-side, ready to gate UI once KAN-21/KAN-25 supply a real
      session; until then `principal: null` denies everything, matching the server-side default.
    - `request.principal`/`request.bindings` have no producer yet — they're populated upstream by auth
      middleware (KAN-21) and the role-binding lookup (KAN-22/KAN-26). Until those land, every
      non-public route in the running app denies by construction; this PR only adds the guard/decorator
      contract, not a fake/dev auth shim.
  - Self-reviewed the diff via two independent subagent passes (correctness angles + cleanup/altitude/
    conventions angles) and fixed the real findings before merging: the original
    `getAllAndOverride`-per-key guard logic let a class-level `@Public()` silently shadow a method-level
    `@RequirePermission` (and vice versa) — rewrote to resolve handler-level metadata first, with
    regression tests for both directions; the eslint rule only matched `MethodDefinition` and missed
    arrow-function class-field route handlers — extended it and manually verified the rule fires on both
    styles; the API guard and the web hook each redefined their own `{type, id}` principal shape instead
    of reusing `Principal` from `@growthos/shared` — both now import it directly; removed dead code in
    the guard's test mock.
  - `pnpm build && pnpm typecheck && pnpm test && pnpm lint` all green (15 tests in `apps/api` incl. a
    full e2e boot of a demo Nest app over real HTTP; 4 new tests in `apps/web`; 143 unchanged in
    `packages/shared`).
  - Branch `kan-24-authz-middleware`, opened as PR #7, merged into `main` (squash). Remote branch
    deletion failed with an HTTP 403 from this sandbox's git remote (not a GitHub permissions issue,
    a proxy/remote restriction) — the branch is merged and dead but not deleted; a human with direct
    repo access can delete `kan-24-authz-middleware` when convenient, or the next run can retry.
- **In progress (exact stopping point):** none — KAN-24 is fully delivered, tested, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** KAN-20 (observability) is still blocked on a human picking between PR #2/#3/#5 (see
  below). Skip it and pick the next unblocked sprint-1/2 `todo`: **KAN-21** (Firebase Auth) or
  **KAN-22** (finish CRUD/cascade tests against the Firestore emulator) — check whether `firebase-tools`
  or an emulator is available in-run before deferring further (it was not available as of this run: no
  `firebase` CLI, no `@firebase/*` emulator packages installed). **KAN-25** (org-scoped sessions/switcher
  UI) depends on KAN-21 existing first. **KAN-26** (hard-isolation/non-enumeration layer) and **KAN-30**
  (keys admin UI) are natural follow-ons once there's a real principal source to test against.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding, unchanged
    by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding; also gates
    KAN-21/KAN-22's Firestore-emulator ACs.
  - Optional: delete the merged `kan-24-authz-middleware` branch on GitHub (this sandbox's git remote
    rejected the delete with a 403).

---

## 2026-07-04 — E0.4 Observability baseline attempt + duplicate-PR cleanup (KAN-20, run 4)

- **Last completed:**
  - Started on **KAN-20** (observability baseline): `createLogger()` (pino, structured JSON,
    redaction) in `@growthos/shared`; `initTelemetry()`/`getActiveTraceId()` (OpenTelemetry
    `NodeSDK`, http instrumentation, OTLP exporter gated on `OTEL_EXPORTER_OTLP_ENDPOINT`) and
    `initSentry()`/`captureException()` (gated on `SENTRY_DSN`, tags events with the trace id) in
    `apps/api/src/instrumentation/`; a global `AllExceptionsFilter` + `AppLoggerService` Nest
    adapter wired into `main.ts`; `uptimeSeconds`/`timestamp` added to `GET /v1/health`.
  - Self-reviewed the diff via a subagent and fixed 5 real findings before opening a PR: the
    exception filter was double-nesting Nest's built-in exception bodies under `message`; the
    logger crashed on `LOG_LEVEL=""` (`??` doesn't treat empty string as absent); redaction missed
    top-level secret fields (only matched one level of nesting); `HealthService` reimplemented
    `isEnvironment()` by hand instead of reusing the shared helper; `main.ts` tagged Sentry with the
    raw env var while the logger used a validated/defaulted one. All fixed with regression tests;
    `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green (21 new/updated tests in
    `apps/api`, 8 in `packages/shared`).
  - **Discovered mid-run that KAN-20 already had two other independent, unmerged implementations**
    open as PR #2 and PR #3 — three separate scheduled runs had picked up the same story before any
    of them merged, all branched off the same pre-merge-policy commit. Opened this work as **PR #5**
    for visibility/comparison but **deliberately did not merge it** — reconciling which
    implementation to keep (raw OTel SDK + custom Sentry wiring vs. `@sentry/nestjs` vs. api-only vs.
    api+web) is a judgment call, not a mechanical next step. Sent a push notification to the repo
    owner about this; marked **KAN-20 `in-progress`** in `TASKS.md` with a pointer to all three PRs.
  - While investigating, also found and cleanly resolved two *unambiguous*, unrelated backlog items
    that had the same problem (PR opened, never merged, under the old policy): rebased, re-verified
    green (`pnpm lint/typecheck/test/build`), and merged **PR #4 (KAN-23 policy engine)** and
    **PR #1 (KAN-45 i18n scaffold)** into `main`. Both are now `done` in `TASKS.md`.
- **In progress (exact stopping point):** KAN-20 is implemented and PR'd (#5) but intentionally
  unmerged pending reconciliation with PR #2/#3. `main` is otherwise clean and green.
- **Blocked + why:** KAN-20 merge is blocked on a human (or an explicitly-instructed run) picking
  one of the three implementations and closing the other two.
- **Next step:** either (a) a human reviews PR #2/#3/#5 and says which to keep, or (b) the next run
  is told explicitly to reconcile KAN-20 itself. Until then, skip KAN-20 and pick the next unblocked
  sprint-1 `todo` — **KAN-21** (Firebase Auth) or **KAN-22** (identity models) are next by table
  order but likely want the Firestore emulator or a real Firebase project (KAN-18 is still
  `needs-human`); check emulator availability before deferring further. **KAN-24** (authz
  middleware) is unblocked now that KAN-23's policy engine is merged.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Consider whether the scheduled-run cadence needs adjusting: three runs independently starting
    KAN-20 before any merged suggests either overlapping schedules or runs not reliably merging
    their own PRs before ending (this run found and fixed the latter for KAN-23/KAN-45's PRs).

## 2026-07-04 — E1.3 Policy engine (KAN-23)

- **Last completed:**
  - Implemented the deny-by-default policy engine at `packages/shared/src/policy/`:
    permission catalog (`permissions.ts`, 15 scopes incl. `ingest.write`, `billing.manage`,
    `pii.read` sourced from plan `08 §5.3` / `06 §3` / task-breakdown E1.3), role bundles
    (`roles.ts`: `platform_admin`, `org_owner`, `org_admin`, `project_admin`, `editor`,
    `operator`, `viewer`, `ingest_only` per plan `08 §5.2`), scope levels (`scopes.ts`:
    `platform` -> `org` -> `project` -> `environment`), and the evaluator (`engine.ts`:
    `can()` / `evaluate()`) that grants a permission only when a binding's role bundle
    contains it *and* the binding's scope is an ancestor-or-self of the requested resource
    — i.e. inheritance flows strictly downward, never up or sideways.
  - `pii.read` is withheld from `project_admin` (separate grant, plan `08 §5.4`) and
    `billing.manage` is withheld from `org_admin` (only `org_owner` carries it) — both are
    deliberate, documented interpretations of the plan, not gaps.
  - Wrote `packages/shared/src/policy/policy.test.ts`: the full (role x permission x level)
    table-driven allow/deny matrix the AC calls for (138 cases), plus deny-by-default,
    downward-inheritance, sideways/upward-denial, multi-binding union, and
    user-vs-service_account principal-isolation cases. 143 tests pass in `packages/shared`
    overall.
  - Refactored `packages/firebase-orm-models` to consume this vocabulary instead of its own
    local `roles.ts` seed (deleted): `MembershipModel` and `RoleBindingModel` now import
    `Role` / `ScopeLevel` / `PrincipalType` from `@growthos/shared`; the package still
    re-exports them for convenience. Updated the one stale test (`isRole('owner')` ->
    `isRole('project_admin')`, the old 4-role seed is gone).
  - `pnpm build && pnpm test && pnpm typecheck && pnpm lint` all green (155 tests across
    5 packages).
  - Branch `kan-23-policy-engine`, PR opened against `main` (not merged — human review
    required per CLAUDE.md).
- **In progress (exact stopping point):** none — this is a clean, self-contained stopping
  point. No admin UI was added for this story: nothing here is yet user-manageable (there is
  no role-binding CRUD surface for a human to operate), so the "admin surface" house rule
  doesn't apply until KAN-25/KAN-30 build that UI against this engine.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** next unblocked sprint-1 `todo` is **KAN-20** (observability baseline) or
  **KAN-45** (i18n scaffold) — both are infra-light. **KAN-21** (Firebase Auth) and
  **KAN-22** (finish CRUD/cascade tests for the identity models against the Firestore
  emulator) are also sprint-1 `todo` but likely want a real/emulated Firebase project;
  check whether the Firestore emulator is available in-run before deferring further.
  **KAN-24** (authz middleware wiring `can()`/`evaluate()` into API route guards + the
  `usePermission` client hook) is the natural follow-on to this story once there are
  protected routes to guard.
- **Waiting on human:**
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD,
    week 1) — still outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding; this
    also gates whether KAN-21/KAN-22's Firestore-emulator ACs can be exercised in a headless
    run.
  - Review and merge (or request changes on) the KAN-23 PR.

## 2026-07-04 — E6.3 i18n scaffold (KAN-45)

- **Last completed:**
  - **KAN-45 (i18n scaffold)**, done, on branch `kan-45-i18n-scaffold`, PR opened against `main`:
    - Added `next-intl` to `apps/web` with locale-prefixed routing: `i18n/routing.ts` (locales
      `en`/`he`, default `en`, `getDirection()` helper), `i18n/navigation.ts`, `i18n/request.ts`,
      and root `middleware.ts`.
    - Moved `app/layout.tsx` + `app/page.tsx` under `app/[locale]/` (Next App Router convention for
      i18n routing); the root layout now sets `<html lang dir>` per-locale (RTL for `he`, LTR for
      `en`) — this is the "RTL layout toggle" from the AC.
    - Added `messages/en.json` + `messages/he.json` translation resources (Hebrew text lives only
      here, never in `.ts`/`.tsx`, per CLAUDE.md) and moved the homepage's copy into them.
    - Added a `LocaleSwitcher` client component (the user-facing surface to change language) shown
      on the homepage.
    - Added an `eslint-plugin-react` `react/jsx-no-literals` rule (errors on raw JSX text children,
      excluded for `*.test.tsx`) in `apps/web/eslint.config.mjs` — this is the lint rule CLAUDE.md
      says enforces "no hard-coded UI strings"; it wasn't wired up yet before this change.
    - Tests: `i18n/routing.test.ts` (locale list + RTL/LTR mapping), `messages/messages.test.ts`
      (en/he key parity + no-empty-value regression guard), `components/locale-switcher.test.tsx`
      (renders both locale options, calls the router with the new locale on change). All green via
      `pnpm test`.
    - Verified manually: `pnpm build` prerenders `/en` and `/he` static routes; ran `next start` and
      curled both routes — confirmed `<html lang="en" dir="ltr">` / `<html lang="he" dir="rtl">` and
      correctly translated body copy.
  - Full `pnpm build && pnpm test && pnpm lint && pnpm typecheck` green across all 5 packages before
    opening the PR.
- **In progress (exact stopping point):** none — KAN-45 is fully delivered, tested, and PR'd.
- **Blocked + why:** nothing blocking.
- **Next step:** next run picks the next unblocked sprint-1 `todo` from `TASKS.md` in table order —
  **KAN-20** (observability baseline) or **KAN-23** (policy engine) are the remaining sprint-1
  candidates with no practical infra dependency; **KAN-21/KAN-25** are better done after KAN-18
  (GCP/Firebase project) lands since they need a real Firebase Auth project to integrate against.
- **Waiting on human:**
  - Review + merge PR for KAN-45 (never auto-merged per CLAUDE.md).
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD, still
    open).
  - **KAN-18** — create GCP/Firebase projects + billing + secrets (still open; gates KAN-21 and most
    infra-dependent stories).

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
    > Implement it fully incl. tests per its AC. Branch + PR. Review your own diff and fix the findings,
    > ensure lint/typecheck/test/build are green, then merge the PR into main. Update PROGRESS.md. If a
    > task exceeds one run, stop at a clean point and document exactly where.

    Recommended cadence: every 1–2 hours during daytime (e.g. cron `0 8-22/2 * * *`), not more
    frequent, to avoid overlapping runs.
