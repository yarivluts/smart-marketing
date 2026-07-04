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
