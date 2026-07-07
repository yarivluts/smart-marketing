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

## 2026-07-07 — E5.1 Metric definition format (KAN-40)

- **Last completed:**
  - Implemented **KAN-40** (plan `04 §2`/`13 §Epic E5`, AC: "Invalid definition rejected with a clear
    error"), a sprint-3 `todo` picked over KAN-37 (dbt staging models — still blocked on a warehouse
    stand-in decision) and KAN-39 (cost guardrails — needs real BigQuery); KAN-40 needed neither, only
    Firestore, the same "buildable today" reasoning KAN-31's schema registry used.
    - `packages/firebase-orm-models`: new `MetricDefModel`
      (`organizations/:organization_id/projects/:project_id/metric_defs`) — one document per version of
      a metric family (identified by `(project_id, name)`, unlike `SchemaDefModel` which also keys on
      `kind`), storing either an `aggregation` (function/table/column/filters) or a `formula` (an
      arithmetic expression over other metrics' names), plus `dimensions` it can be broken down by.
      New `metric-registry.service.ts`: `registerMetricDefinition` (v1) / `evolveMetricDefinition`
      (v{n+1}, previous kept `status: 'superseded'`, never mutated) mirror KAN-31's versioning pattern
      exactly, so historical dashboards can later pin a version (plan `04 §7`). Validation rejects: an
      invalid metric name (must match schema-name-like `^[a-z][a-z0-9_]*$`), an unknown aggregation
      function, a missing required column (every function except `count`), an unknown filter operator,
      malformed formula syntax (only metric-name characters + `+ - * / ( )` allowed, parens balanced), a
      formula with no metric references, a formula referencing itself, a formula referencing a metric
      that was never registered, and — the one genuinely novel piece of logic this story needed beyond
      the schema-registry mirror — a **transitive circular-dependency check** across evolutions: if
      metric A's formula references B, then evolving B to reference A is rejected even though B's own
      evolution only checks that A currently exists and is active (a naive "does the direct reference
      exist" check misses this, since the graph was acyclic when A was created and only becomes cyclic
      later when B changes).
    - `apps/web`: a project-scoped `orgs/:orgId/projects/:projectId/metric-defs` page — register a new
      metric (aggregation or formula, with a dimensions field and a filter-row builder for aggregations)
      and evolve an existing family via a form prefilled from its latest version — gated on the
      **already-existing** `metrics.write` permission (granted to `platform_admin`/`org_owner`/
      `org_admin`/`project_admin`/`editor` since KAN-23's policy-catalog freeze; no catalog change
      needed this run). New `GET/POST .../metric-defs` and `POST .../metric-defs/evolve` routes. Full
      en/he translations; no hard-coded strings. Audit logging wired into both register/evolve
      (`metric_def.register`/`metric_def.evolve`), the same "config change" surface KAN-44's audit log
      already covers for schema register/evolve.
    - Tests: a new package-level emulator suite (`metric-registry.emulator.test.ts`, 15 tests) covering
      every validation rule individually, the version-evolution/supersede behavior, cross-project
      isolation, and — deliberately, since it's the one nontrivial piece of logic — a regression test
      that specifically builds the "A references B, then B is evolved to reference A" scenario and
      confirms the second evolution is rejected as circular. New `apps/web` route tests (register +
      evolve, incl. a "rejects a missing name/invalid definition/unknown function" 400 case and a
      duplicate-name 409 case), component tests for both forms, a KAN-26 non-enumeration isolation
      scenario in `isolation.test.ts`, and an e2e spec (`e2e/metric-defs.spec.ts`) driving register an
      aggregation -> evolve its dimensions -> register a formula referencing it -> an invalid formula
      (referencing an unregistered metric) rejected, through a real browser.
  - **Self-review** before opening the PR found and fixed:
    - The first version of the audit-log wiring passed `aggregation`/`formula` straight through to
      `recordAuditLogEntry`'s `before`/`after` payload, including as `undefined` for whichever one didn't
      apply to a given definition kind. Firestore's `setDoc` rejects any field whose value is literally
      `undefined`, so **every** `recordAuditLogEntry` call for this feature was silently throwing and
      getting swallowed by its own best-effort `try/catch` — audit logging never actually worked, and
      nothing but the emulator test's own stderr output surfaced it (lint/typecheck stayed green through
      it). Fixed with a shared `auditSnapshot()` helper that omits unset fields; added a regression test
      asserting a real audit entry lands in `listAuditLogEntriesForOrg` for both register and evolve.
    - Removed an unused `isMetricDefStatus` type-guard export that had no call site anywhere in the diff
      (the KAN-31 `SchemaDefModel` precedent this story mirrors doesn't even have an equivalent).
  - `pnpm lint && pnpm typecheck && pnpm build` all green. `pnpm test`: 151 tests in
    `packages/firebase-orm-models` (incl. 15 new in `metric-registry.emulator.test.ts`), 167 in
    `packages/shared` (untouched), 35 in `apps/api` (untouched), 269 web unit/route tests (up from 253 —
    incl. new route/component tests and the new isolation scenario), 16/16 Playwright e2e (incl. the new
    `metric-defs.spec.ts`). One self-recovering Playwright retry on `auth.spec.ts`'s sign-up flow during
    local verification — the same long-documented sandbox sign-up flake every prior entry has hit, not a
    regression (my own new e2e spec passed clean on its first attempt both times it ran).
  - Branch `kan-40-metric-definition-format`, PR #25. First CI attempt failed on the documented gRPC
    `RESOURCE_EXHAUSTED` Firestore-emulator flake, this time in `models.emulator.test.ts` (unrelated,
    pre-existing, not touched by this diff) — confirmed by reading the actual job log rather than
    assuming flake, since this story's own new `metric-registry.emulator.test.ts` suite had passed
    cleanly earlier in that same run. Re-ran via `rerun_failed_jobs`; second attempt went green
    (`mergeable_state: clean`). Merged (squash) into `main`. Remote branch deletion failed with the same
    HTTP 403 from this sandbox's git remote recorded in every prior run's entry (not a GitHub
    permissions issue; no branch-delete tool exists in the GitHub MCP server either) — merged and dead
    but not deleted.
- **In progress (exact stopping point):** none — KAN-40 is fully delivered, independently reviewed,
  tested, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** **KAN-41** (compiler: metric definition + query request -> BigQuery SQL) is the natural
  next pick — it's the direct consumer of this story's `getActiveMetricDefinition`/`MetricDefModel`
  shape, though it needs a decision on what "compile to SQL" means without a real warehouse yet (same
  buildable-today tension KAN-37 keeps hitting; KAN-41's AC is "golden-file SQL tests for 10
  representative queries", which is actually achievable without a live warehouse — the tests just assert
  on the generated SQL string, not on executing it — so KAN-41 may be more tractable than KAN-37 despite
  the surface-level similarity). **KAN-38** (orchestration) and **KAN-39** (cost guardrails, needs real
  BigQuery) are also sprint-3 `todo`s; KAN-37 (dbt) remains the most infra-blocked of the four.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding, unchanged
    by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-40-metric-definition-format` branch on GitHub (this sandbox's git
    remote rejected the delete with a 403), and the other still-outstanding merged branches from prior
    runs noted in earlier entries below.

---

## 2026-07-07 — E6.2 Audit log service (KAN-44)

- **Last completed:**
  - Implemented **KAN-44** (plan `13 §E6.2`, AC: "Tamper-evident; visible in admin UI (basic list)"), one
    of the two independent sprint-3 `todo`s the prior run's own "Next step" flagged (the other,
    KAN-37 dbt staging models, needs a real warehouse target this repo has no buildable-today stand-in
    for yet — audit log has no such infra dependency, so it was the more tractable pick this run).
    - `packages/firebase-orm-models`: new `AuditLogEntryModel`
      (`organizations/:organization_id/audit_log_entries`) — org-scoped rather than project-scoped,
      since an org's audit trail spans org-level changes (membership/role grants) and every project
      under it (keys, schema defs) alike; `project_id`/`environment_id` recorded per entry when the
      action was scoped narrower than the org. "Tamper-evident" is a literal, verifiable property here,
      not just a doc-comment claim: every entry carries `prev_entry_hash`/`entry_hash`, an append-only
      sha256 hash chain per org (`audit-log.service.ts`'s `recordAuditLogEntry` reads the org's current
      newest entry and links onto it; `entry_hash` commits to the entry's own content *and* that link).
      `verifyAuditLogChainForOrg` recomputes every entry's hash and chain link, oldest first, and
      reports the first entry where either check fails, distinguishing `hash_mismatch` (an
      already-written entry's content was edited after the fact) from `chain_break` (a link doesn't
      point at what actually precedes it — real tampering, or a benign concurrent-append fork; the
      function's own doc comment is explicit it can't tell the two apart by itself). `listAuditLogEntriesForOrg`
      is the newest-first read side the admin UI's "basic list" AC needs.
    - Wired `recordAuditLogEntry` (best-effort, wrapped in try/catch — audit logging must never turn an
      otherwise-successful admin action into a failure for the caller, the same tradeoff every other
      secondary side-effect write in this codebase already accepts) into the "key/role/schema" surfaces
      that existed at pick time: `key.service.ts`'s `mintApiKey`/`revokeApiKey`, `schema-registry.service.ts`'s
      `registerSchemaDefinition`/`evolveSchemaDefinition`, `invite.service.ts`'s `acceptInvite` (the
      actual role-grant moment), `membership.service.ts`'s `removeOrgMember` (covers both "revoke a
      pending invite" and "remove an active member" — it already handled both), `quarantine.service.ts`'s
      `replayQuarantinedRecord`, and `pipeline.service.ts`'s `replayFailedPipelineMessagesForProject` —
      the last two explicitly called out in the KAN-34 entry below as "exactly the kind of change KAN-44's
      audit log is meant to capture once it exists." `removeOrgMember`/`replayQuarantinedRecord` gained a
      new required `performedByUserId` parameter (both had none before); `replayFailedPipelineMessagesForProject`
      gained an optional trailing one (a future scheduled-worker caller with no human actor can omit it —
      no entry is recorded in that case rather than recording a synthetic "system" actor for a real human
      action's own admin-triggered path). Every call site's own existing tests (and 4 emulator test files'
      pre-existing calls to the now-longer signatures) updated to pass a real actor id.
    - `packages/shared`: new `audit.read` permission — granted to `platform_admin`/`org_owner`/`org_admin`
      (automatically, via their `ALL_PERMISSIONS`-based bundles) but withheld from `project_admin` (plan
      `06 §1` frames the audit log as an org-admin console surface, not a per-project one) and from every
      API key scope (`API_KEY_SCOPES`) — a leaked ingest key reading an org's full change history would be
      a real information-disclosure risk. `index.test.ts`'s "full partition of `PERMISSIONS`" test updated
      to list it as withheld from keys.
    - `apps/web`: a project-independent `orgs/:orgId/audit-log` page — newest-first entry list (actor,
      action, target, summary, timestamp) plus a chain-integrity banner (`verifyAuditLogChainForOrg`'s
      result rendered as "chain verified" or a tampering warning naming the first broken entry) — gated on
      `audit.read`, linked from the org detail page next to the existing Resource Library link. New
      `GET orgs/:orgId/audit-log` route (list-only; there's no POST — every entry is written internally by
      the service that performed the audited action, never directly by a caller of this route). Full en/he
      translations; no hard-coded strings.
    - Tests: a new package-level emulator suite (`audit-log.emulator.test.ts`) covering the hash chain
      (first entry links onto `''`, second onto the first's hash), org-scoped listing (cross-org
      isolation), `verifyAuditLogChainForOrg`'s valid/hash_mismatch/chain_break outcomes (the
      chain_break case deliberately forges a *self-consistent* entry — same content, same recomputed
      hash, wrong link — since naively corrupting `prev_entry_hash` alone actually produces a
      `hash_mismatch`, because `entry_hash` is computed *over* `prev_entry_hash`; a naive test would have
      been testing the wrong branch), and the wiring into every call site above (each produces the
      expected action/actor/target). New `apps/web` route test (`audit-log/route.test.ts`: 401/404/403/
      empty-200/entry-surfaced-with-valid-chain) and a KAN-26 non-enumeration isolation scenario in
      `isolation.test.ts`.
  - **Self-review** before opening the PR found and fixed:
    - The first version of the `chain_break` regression test forged only `prev_entry_hash` on a
      reloaded entry, leaving its old `entry_hash` in place — this actually exercises `hash_mismatch`
      (entry_hash no longer matches a recomputation that now includes the forged prev-hash), not
      `chain_break`, since the two failure modes share the same recomputation step and `hash_mismatch`
      is checked first. Fixed by also recomputing and setting a self-consistent `entry_hash` for the
      forged content, which only then genuinely exercises the link-mismatch branch. Exported
      `buildHashableContent`/`computeEntryHash` from `audit-log.service.ts` (not re-exported via this
      package's `index.ts`, so still invisible to `apps/api`/`apps/web`) purely so the test could
      construct this scenario without duplicating the hashing logic.
    - **Reviewed and deliberately left as-is / deferred**: `vault.service.ts`'s `setSharedCredentialSecret`/
      `rotateSharedCredentialSecretKey` (KAN-29) and `resource-library.service.ts`'s attach/approve/
      reject/detach flow (KAN-27) are both "config changes" the plan's AC would also cover, but neither
      carries a `performedByUserId`-shaped actor param today; wiring them in is a natural, small
      follow-up (same shape as this run's `removeOrgMember`/`replayQuarantinedRecord` changes) but adding
      two more new-required-parameter signature changes and their own emulator-test updates was cut from
      this run's scope to keep the diff reviewable. Org/project *creation* (`createOrganizationWithOwner`/
      `createProject`) also isn't wired — arguably "config changes" too, but there's no existing org to
      scope the first entry's audit trail to until the org itself exists, so this would need its own
      design (log to the newly-created org's own trail, immediately after creation) rather than reusing
      the pattern this run used everywhere else.
  - `pnpm lint && pnpm typecheck` clean; `pnpm build` green (new `/orgs/[orgId]/audit-log` page and API
    route both compile into the production build). `pnpm test`: 136 tests in `packages/firebase-orm-models`
    (incl. 13 new in `audit-log.emulator.test.ts`), 167 in `packages/shared` (up from 138 — the
    `audit.read` permission adds one row per role to the existing table-driven matrix), 35 in `apps/api`
    (untouched by this diff, reran as part of the standard full check), 253 web unit/route tests (incl.
    5 new in `audit-log/route.test.ts`) — all green. The Playwright e2e run was unusually flaky this
    session specifically (5 different, unrelated specs — `auth`, `keys`, `orgs`, `resource-library`,
    `schema-registry` — each failed once on a UI-interaction timeout and passed on Playwright's own
    retry, landing the overall `pnpm test` exit code at 0): traced this down before trusting it as
    "just flake" — reproduced `resource-library.spec.ts` failing in isolation with `--retries=0` against
    a from-scratch worktree of `main` with none of this diff's changes applied, at a step (initial
    sign-up) this diff never touches, confirming it's this sandbox's own resource contention under
    repeated Next-dev-server + Chromium + Firestore/Auth-emulator launches in one session, not a
    regression — consistent with this file's own long-documented "gRPC RESOURCE_EXHAUSTED" /
    "Playwright sign-up flake" flake category, just an unusually pronounced instance of it today.
  - Branch `kan-44-audit-log-service`, PR #24. CI green (`lint · typecheck · test · build`),
    `mergeable_state: clean`, merged (squash) into `main` on the first attempt — no stall/flake, no
    duplicate PR found this run. Remote branch deletion failed with the same HTTP 403 from this
    sandbox's git remote recorded in every prior run's entry (not a GitHub permissions issue; no
    branch-delete tool exists in the GitHub MCP server either) — merged and dead but not deleted.
- **In progress (exact stopping point):** none — KAN-44 is fully delivered, independently reviewed,
  tested, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** the natural next picks are **KAN-37** (dbt staging models — still needs a
  buildable-today warehouse stand-in decision, e.g. dbt-duckdb over an exported snapshot, since there's
  no real BigQuery project yet) and the two audit-log follow-ups this run deliberately deferred: wiring
  `recordAuditLogEntry` into KAN-29's vault secret set/rotate and KAN-27's resource-attachment
  approve/reject/detach flow (both need a small `performedByUserId`-shaped signature change, the same
  pattern this run used for `removeOrgMember`/`replayQuarantinedRecord`). KAN-38 (orchestration),
  KAN-39 (cost guardrails), KAN-40 (metric definition format) are also sprint-3 `todo`s and independent.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding, unchanged
    by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-44-audit-log-service` branch on GitHub (this sandbox's git remote
    rejected the delete with a 403), and the other still-outstanding merged branches from prior runs
    noted in earlier entries below.

---

## 2026-07-07 — E3.4 Quarantine + DLQ + replay API; per-key rate limiting (KAN-34)

- **Last completed:**
  - Implemented **KAN-34** (plan `13 §E3.4`, AC: "Invalid records land in quarantine with reason;
    replay after schema fix succeeds"), the natural next sprint-3 pick per the prior run's own
    "Next step" — the direct consumer of KAN-33's `failed`-status `PipelineMessageModel`s (a dead end
    with no replay path) and of the raw-payload gap KAN-32/33's entries both flagged for quarantined
    records.
    - `packages/firebase-orm-models`: new `QuarantinedRecordModel`
      (`organizations/:organization_id/projects/:project_id/quarantined_records`) — the durable home a
      quarantined record never had before this story; `IngestBatchModel.record_results` only ever
      stored validation status (`status`/`reasons`), never the payload, so there was nothing to
      resubmit. `ingest.service.ts`'s `ingestBatch` now writes one of these, best-effort (same
      tradeoff as its dedup-key claims and pipeline publish — a write failure here never turns an
      otherwise-successful 202 into a 500), for every quarantined record — envelope failures and
      schema-validation failures alike. Refactored `prepareRecord`'s envelope checks into an exported
      `checkRecordEnvelope(kind, raw)` and exported `validateAgainstSchema`/`dedupKeyId` so the new
      replay path reuses the identical validation/hashing logic rather than duplicating it.
    - New `quarantine.service.ts`: `listQuarantinedRecordsForProject` (newest-first, `status ===
      'quarantined'` only) and `replayQuarantinedRecord` — re-runs `checkRecordEnvelope` +
      `validateAgainstSchema` against the record's persisted raw payload and the **current** active
      schema (which may have evolved since the record was first quarantined). On success: claims the
      record's dedup slot (same `dedupKeyId` hash a normal accepted resend would claim), publishes and
      lands it into the pipeline exactly like `ingestBatch` would, marks the record `replayed`, and
      returns `accepted`. If another accepted record already claimed the same slot in the meantime
      (a race between a corrected resend and a late replay), it resolves as `duplicate` instead —
      matching `ingestBatch`'s own "duplicate is benign" posture. If validation still fails, the record
      stays `quarantined` with its `reasons` refreshed, replayable again later. The original
      `IngestBatchModel`'s own `record_results` is never retroactively mutated — replay history lives
      on the quarantine record itself, keeping batch documents an immutable point-in-time record.
    - `pipeline.service.ts` gains the pipeline's own DLQ replay: `listFailedPipelineMessagesForProject`
      / `replayFailedPipelineMessagesForProject` — `landMessage`'s `failed`/`failure_reason` shape
      already existed (KAN-33), but nothing ever revisited a message once it landed there;
      `drainPendingPipelineMessages` only ever swept `queued` messages. These reuse the same private
      `landMessages` helper, project-scoped (not per-environment, matching `listRecentIngestBatchesForProject`'s
      "fold every environment into one admin view" convention) since there's no per-environment
      admin surface for this.
    - New `rate-limit/` module: a provider-agnostic `RateLimiter` interface + `InMemoryTokenBucketRateLimiter`
      — this repo has no Redis dependency, docker-compose service, or emulator anywhere yet (confirmed via a
      repo-wide search before building this), so a real Redis-backed limiter isn't buildable today; this
      stands in until KAN-18 provisions one, the same "buildable today, swap the provider later" split
      `vault/local-kms-provider.ts` used for KMS before KAN-18. Default: 10 req/s sustained, bursts to 600
      (headroom above the "1k events/s" ingest AC since one request can carry up to `MAX_INGEST_BATCH_SIZE`
      records). `apps/api`'s `ApiKeyAuthGuard` now calls `this.rateLimiter.consume(apiKey.id)` after
      authentication/scope checks succeed (so an invalid-key brute force never spends or exhausts a real
      key's budget), returning `429` + a manually-set `Retry-After` header on exhaustion. Wired via a
      `API_KEY_RATE_LIMITER` DI token registered in `IngestModule` (so a future bearer-key-guarded route
      shares the same limiter instance) with an `@Optional()` constructor fallback to the shared
      `defaultApiKeyRateLimiter` singleton for direct/non-DI construction.
    - `apps/web`: the KAN-35 ingest-health page's quarantine browser now reads from
      `listQuarantinedRecordsForProject` directly instead of deriving from batches'
      `record_results` — this gives each quarantined record a real, stable id (the old view was keyed by
      `(batchId, recordIndex)`, which a replay action has nothing to reference) — with a new **Replay**
      button per record (`ReplayQuarantinedRecordButton`) showing the outcome inline. New **Pipeline
      delivery failures** section lists `listFailedPipelineMessagesForProject` with a **Retry failed
      deliveries** button (`RetryFailedPipelineMessagesButton`) calling
      `replayFailedPipelineMessagesForProject`. Two new Next.js API routes
      (`.../quarantined-records/[id]/replay`, `.../ingest-health/replay-failed-pipeline-messages`), both
      gated on `ingest.write` (same permission the page itself requires) — matching the plan's own "dead
      letter queue with replay from the admin console" framing rather than exposing replay through
      `apps/api`'s bearer-key ingest routes.
  - **Self-review** (read through the full diff for correctness bugs, missing tests, and
    reuse/simplification issues before opening the PR) found and fixed:
    - A lint error (`prodEnvironment` destructured but unused) in a new pipeline DLQ emulator test.
    - Two test-authoring bugs caught only by actually running the emulator suite, not by
      lint/typecheck: `registerSchemaDefinition` requires at least one field (a test passed `fields:
      []`), and a "replay resolves as duplicate" test's race scenario was wrong — a record originally
      quarantined for a *missing required field* can never independently re-validate on replay (its own
      persisted payload still lacks that field), so the race has to be built around an
      *unregistered-field* quarantine instead (fixable by evolving the schema to register the field,
      independent of whether a corrected resend also raced in first).
    - A rate-limiter unit test's own expected-value arithmetic was wrong (expected the bucket to read
      `0` after a long idle refill + one spend, when capacity-capped refill + one spend actually leaves
      `capacity - 1`).
    - Missing test coverage for `ApiKeyAuthGuard`'s `@Optional()` constructor fallback to
      `defaultApiKeyRateLimiter` when constructed without an explicit rate limiter (every other test in
      the file, after the rewrite for KAN-34, injected one explicitly) — added.
    - **Reviewed and deliberately left as-is**: replaying an already-`replayed` record a second time is
      unguarded against explicitly, but is provably safe — its dedup slot is already claimed by its own
      first successful replay, so a second call's dedup check always resolves `duplicate`, never
      resurrecting the record back to `quarantined`; the UI can't trigger this path anyway since a
      replayed record no longer appears in `listQuarantinedRecordsForProject`'s `status === 'quarantined'`
      filter. Also left as-is: no admin surface for tuning a key's rate-limit capacity/refill rate —
      the AC doesn't call for one, and there's no per-key override field to manage yet (a single shared
      default is used everywhere), so CLAUDE.md's "everything user-manageable gets an admin surface"
      rule doesn't yet have anything to attach to here.
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green after every fix round (123 tests
    in `packages/firebase-orm-models` incl. the new `quarantine.emulator.test.ts` (9 tests) and 3 new
    DLQ tests in `pipeline.emulator.test.ts`, 35 in `apps/api` incl. 6 new rate-limiting tests, 242 web
    unit/route tests incl. new component tests for both admin buttons + updated `ingest-health-view`
    tests, 15/15 Playwright e2e in `apps/web` incl. updated/extended `ingest-health.spec.ts`). One
    transient flaky Playwright retry (`auth.spec.ts`'s sign-up flow, unrelated to this diff) on the
    first full run self-recovered on retry; a from-scratch rerun afterward had zero flakes.
  - Branch `kan-34-quarantine-dlq-rate-limit`, PR #23. CI green (`lint · typecheck · test · build`),
    `mergeable_state: clean`, merged (squash) into `main` on the first attempt — no stall/flake, no
    duplicate PR found this run. Remote branch deletion failed with the same HTTP 403 from this
    sandbox's git remote recorded in every prior run's entry (not a GitHub permissions issue; no
    branch-delete tool exists in the GitHub MCP server either) — merged and dead but not deleted.
- **In progress (exact stopping point):** none — KAN-34 is fully delivered, independently reviewed,
  tested, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** **KAN-37** (dbt project: staging models over raw ingest, canonical entities/events/
  measures core tables, dbt tests) and **KAN-44** (audit log service) are both sprint-3 `todo`s and
  independent of each other and of this story — either is a reasonable next pick. KAN-35's own
  ingest-health page could also eventually show the pipeline-delivery-failures section this run added
  per-project rather than needing a human to know to look; no further action needed there for now.
  Worth noting for whoever picks up KAN-44 (audit log): this story's replay actions (quarantine replay,
  pipeline DLQ retry) are exactly the kind of "config/key/role/schema change" KAN-44's audit log is
  meant to capture once it exists — neither was wired to write an audit entry, the same "buildable
  today" deferral KAN-30/31 already used for their own not-yet-built dependency.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding,
    unchanged by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-34-quarantine-dlq-rate-limit` branch on GitHub (this sandbox's git
    remote rejected the delete with a 403, and the GitHub MCP server has no delete-branch tool either),
    and the other still-outstanding merged branches from prior runs noted in earlier entries below.

---

## 2026-07-07 — Reconciled two stale unmerged PRs (KAN-33, KAN-35); fixed apps/api's missing emulator-flake tolerance

- **Last completed:**
  - Read PROGRESS.md/TASKS.md per the usual start-of-run routine. TASKS.md still listed **KAN-33**
    and **KAN-35** as the natural next picks, but both already had complete, self-reviewed, green-CI
    PRs open from an earlier, same-day run that never merged them or updated these files — the same
    "KAN-20 problem" this file has documented repeatedly (an unfinished run's work going unreconciled).
    Rather than redo the work, verified and merged both rather than re-implementing from scratch.
  - **PR #21 (KAN-33, `kan-33-ingest-pipeline`)**: independently re-read the whole diff (pipeline
    outbox/sink models, `pipeline.service.ts`'s publish/land/drain split, the per-batch-scoped landing
    fix its own self-review already found) and reran `pnpm lint && pnpm typecheck && pnpm test &&
    pnpm build` from a clean local checkout rather than trusting the recorded CI result — all green
    (100 tests in `packages/firebase-orm-models` incl. the new pipeline suite, one self-recovering
    gRPC `RESOURCE_EXHAUSTED` retry, same documented flake as every prior entry). Found nothing to
    fix beyond what the PR's own review already caught. Merged (squash) into `main`.
  - **PR #20 (KAN-35, `kan-35-ingest-health-admin-ui`)**: this branch predated KAN-33's merge, so its
    diff against the now-updated `main` showed KAN-33's pipeline files as *deleted* — merging as-is
    would have reverted KAN-33. Rebased the branch onto `main` locally; the only conflict was
    `packages/firebase-orm-models/src/index.ts`'s barrel export list (both stories appended a line at
    the same spot), resolved by keeping both new exports. Force-pushed the rebased branch to update
    the PR in place rather than opening a new one.
  - Reran the full check suite on the rebased branch — **CI then failed** on `apps/api`'s
    `ingest.controller.e2e.spec.ts` (`Exceeded timeout of 5000 ms`) on two specs exercising the full
    `ingestBatch` flow. Root cause: `packages/firebase-orm-models`'s and `apps/web`'s own
    `vitest.config.ts` already carry an explicit 30s `testTimeout` + automatic retries specifically
    for the documented Firestore-emulator gRPC `RESOURCE_EXHAUSTED` flake (a backoff/retry cycle that
    can stall a request for tens of seconds) — but `apps/api`'s `jest.config.js` had neither. That gap
    was latent until now: KAN-33 added a couple more sequential emulator writes to `ingestBatch`'s own
    request path (publish + land the pipeline message), pushing the two e2e specs that exercise it
    close enough to Jest's 5s default that a hit of the same pre-existing flake now failed the test
    outright instead of self-recovering. Fixed by adding `apps/api/src/jest.setup.ts`
    (`jest.retryTimes(3, ...)`) and `testTimeout: 30_000` in `jest.config.js`, matching the vitest
    suites' own reasoning verbatim. Verified locally (`apps/api`'s 29 tests green), pushed, CI went
    green on the next run, merged (squash) into `main`.
  - Both branches' remote deletion failed with the same HTTP 403 from this sandbox's git remote
    recorded in every prior run's entry (not a GitHub permissions issue) — merged and dead but not
    deleted.
- **In progress (exact stopping point):** none — both KAN-33 and KAN-35 are now fully delivered,
  independently re-verified (not just trusted from their original PRs), and merged. The apps/api jest
  timeout/retry fix is a real, durable gap-closure, not a workaround scoped to this PR only — any
  future apps/api emulator-backed spec now inherits the same 30s/retry tolerance.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** **KAN-34** (quarantine + DLQ + replay API; per-key rate limiting, Redis token bucket)
  is the next sprint-3 `todo` — it's what would let KAN-35's quarantine browser grow the replay button
  its own PR deliberately left out (now unblocked on the payload side by KAN-33's `RawRecordModel`,
  though a *quarantined* record still has no raw-payload store — KAN-34 would need to decide whether
  quarantined records also get a durable store, or only accepted ones). **KAN-44** (audit log service)
  and **KAN-37** (dbt staging models) are also sprint-3 `todo`s and independent. Worth a repo-wide
  sweep at some point for any other emulator-backed jest/vitest suite missing the timeout/retry
  tolerance this run added to `apps/api` — `apps/api` only had one spec file hitting a real emulator
  before this, so it was the only gap, but a future new emulator-backed jest suite in `apps/api` would
  need to remember `setupFilesAfterEnv` already covers it (nothing to do), whereas a *new package* with
  its own jest config would need the same setup copied in.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding,
    unchanged by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-33-ingest-pipeline` and `kan-35-ingest-health-admin-ui` branches
    on GitHub (this sandbox's git remote rejected both deletes with a 403), and the other
    still-outstanding merged branches from prior runs noted in earlier entries below.

---

## 2026-07-06 — E3.3 Ingest pipeline (KAN-33)

- **Last completed:**
  - Implemented **KAN-33** (pipeline: accepted records -> Pub/Sub -> BigQuery raw tables, partitioned
    by `org/project/env/date`; plan `13 §E3.3`, AC "event visible in BQ < 60s after 202"), the natural
    next pick — sprint-3, direct downstream consumer of KAN-32's `ingestBatch`, and closes the gap
    that entry itself flagged: accepted records weren't yet landed anywhere durable, only their
    validation outcome.
    - `packages/firebase-orm-models`: new `PipelineMessageModel`
      (`organizations/:organization_id/projects/:project_id/pipeline_messages`) — a durable outbox
      standing in for a real Pub/Sub topic per project (plan `08`: "native Pub/Sub/Kafka topic per
      project") until KAN-18 provisions one. New `RawRecordModel`
      (`.../raw_records`) — a partitioned-BigQuery-raw-table stand-in, `partition_date` (derived from
      landing time) standing in for the column a real table would partition on; keyed by its source
      `PipelineMessageModel`'s own id so re-landing the same message (a retry, or a future KAN-34
      replay) is an idempotent overwrite, not a duplicate row.
    - New `pipeline/` module: `transport.ts`'s `publishPipelineMessage()` (a plain function — no
      interface, since nothing substitutes an alternative implementation today) writes a `queued`
      message; `sink.ts`'s `WarehouseSink` interface + `FirestoreWarehouseSink` (kept as an interface,
      unlike the transport, because tests do substitute it) lands one into `RawRecordModel`.
    - New `pipeline.service.ts`: `enqueueAcceptedRecordsForPipeline` (publishes every accepted record,
      per-record failure isolated via `Promise.allSettled` — one record's publish failure doesn't
      block its batch-mates), `landPipelineMessages` (lands a given set of messages in parallel — the
      "Pub/Sub subscriber -> BigQuery insert" hop, scoped to exactly the messages just published),
      and `drainPendingPipelineMessages` (a separate, explicitly environment-wide catch-up sweep over
      anything still `queued`, for a future scheduled worker/KAN-38, not called from the ingest path).
    - `ingest.service.ts`'s `ingestBatch` now publishes every accepted record's full raw payload (not
      just the schema-validated subset) right after its existing dedup-key-claim writes, then lands
      exactly those messages — best-effort, wrapped the same way as the dedup-key claims just above it,
      so a transient pipeline failure never turns an otherwise-successful 202 into a 500. A record
      whose landing fails is marked `failed` for KAN-34's future replay/DLQ to pick up.
  - **Independent 8-angle review** (3 correctness angles + cross-file + reuse + simplification +
      efficiency + altitude + CLAUDE.md conventions, each its own dedicated fan-out) before merging.
      Six of the eight angles converged on the same root issue and it dominated the fix round:
    - `ingestBatch` originally awaited an *unscoped* `drainPendingPipelineMessages` call after
      publishing — querying and landing the **entire environment's** queued backlog on every single
      ingest request, not just the batch's own newly-published records. Under concurrent ingest
      traffic (the story's own "1k events/s" context) this meant every request's latency scaled with
      total system-wide queue depth rather than its own batch size, concurrent requests raced over
      landing the same stray messages, and a slow/failed drain in one request silently left messages
      for an *unrelated* caller to sweep up later. Fixed by having `enqueueAcceptedRecordsForPipeline`
      return the messages it just created and adding `landPipelineMessages` to land exactly those, in
      parallel; `drainPendingPipelineMessages` still exists (renamed-in-role, not removed) as an
      explicit, differently-used catch-up sweep for later. Added a regression test (in both
      `pipeline.emulator.test.ts` and end-to-end via `ingest.emulator.test.ts`) proving a stray queued
      message left by an unrelated batch in the same environment is never touched by another batch's
      own landing.
    - `enqueueAcceptedRecordsForPipeline` used a single `Promise.all` (all-or-nothing: one record's
      publish failure aborted publishing for every other record in the same batch, unlike the
      dedup-key-claim loop immediately above it in `ingestBatch`, which isolates failures per record).
      Switched to `Promise.allSettled`, keeping only the fulfilled messages.
    - `drainPendingPipelineMessages`'s per-message landing ran in a sequential `for` loop (up to 500
      independent writes, one at a time) instead of in parallel: parallelized via a shared
      `landMessages` helper.
    - A message's final status-save call sat outside the `try/catch` guarding the sink write, so if
      *that* write itself failed after a successful landing, the exception propagated and aborted
      every other message still queued in the same drain call. Wrapped in its own best-effort
      try/catch — a failed status write just leaves the message re-drainable later (idempotent by id).
    - `transport.ts`'s `PipelinePublishInput` and `sink.ts`'s `WarehouseRawRow` were byte-for-byte
      identical interfaces declared twice; consolidated into one `PipelineRecordEnvelope` in a new
      `pipeline/record.ts`.
    - `PipelineTransport` interface + `FirestoreOutboxTransport` class + `defaultPipelineTransport`
      singleton were unjustified indirection — unlike `WarehouseSink` (genuinely substituted by a
      test), nothing ever substituted an alternative transport. Removed in favor of a plain
      `publishPipelineMessage()` function; add the interface back only once a real second
      implementation (a `GcpPubSubTransport`) is actually being written.
    - `ingest.service.ts` recomputed `asRecord(record)` a second time outside `prepareRecord`, which
      had already computed the identical value internally as `r`; `prepareRecord` now returns it
      (`raw`) instead of the caller redoing the work.
    - `IngestBatchModel`'s doc comment overclaimed a landed raw record is "keyed by this batch's own
      id" — it's actually keyed by its own `PipelineMessageModel`'s id and only *queryable* back to
      the batch via a `batch_id` field. Corrected.
    - **Reviewed and deliberately left as-is**: the missing Firestore composite index
      (`environment_id`, `status`, `enqueued_at`) `drainPendingPipelineMessages`'s query would need on
      a real (non-emulator) project — flagged by the review, but this repo provisions no
      `firestore.indexes.json` for *any* multi-field query yet (a KAN-18 infra concern, not unique to
      this diff); documented in the function's own doc comment instead. Also left as-is: this diff's
      own emulator test file duplicating the `unique`/`uniqueEmail`/`setupProject` helpers already
      copy-pasted across six other emulator test files — a pre-existing repo-wide convention, not a
      regression introduced here, and out of scope for this story to unwind unilaterally.
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green after every fix round (100
    tests in `packages/firebase-orm-models` incl. the new `pipeline.emulator.test.ts` (7 tests) and 2
    new KAN-33 tests in `ingest.emulator.test.ts`, 159 in `packages/shared`, 29 in `apps/api`, 223 web
    unit/route tests + 13/13 Playwright e2e in `apps/web`). No emulator flake this run.
  - Branch `kan-33-ingest-pipeline`, PR pending at time of writing this entry — see the PR link in the
    branch's own history for CI status; this entry is written before the final merge step so a
    follow-up run can confirm and finish if this run stops first.
- **In progress (exact stopping point):** KAN-33 implementation, review, and local
  lint/typecheck/test/build are complete and green; opening the PR and merging (pending CI) is the
  only remaining step for this story.
- **Blocked + why:** nothing blocking; CI needs to run and go green before merge.
- **Next step:** confirm PR CI is green, merge (squash) into `main`, delete the branch if the git
  remote allows it this time (every prior run this sandbox's remote has rejected branch deletion with
  an HTTP 403). After that, **KAN-34** (quarantine + DLQ + replay API, per-key rate limiting) is the
  natural next pick — it's the direct consumer of this story's `failed`-status `PipelineMessageModel`s
  (currently a dead end with no replay path) and of KAN-32's quarantined ingest records. **KAN-35**
  (Admin UI: ingest health, quarantine browser + replay button) is downstream of both KAN-33 and
  KAN-34 and should probably follow once there's something for it to show/replay.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding,
    unchanged by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged branches from prior runs noted in earlier entries below, once this
    run's own branch is also ready to prune.

---

## 2026-07-06 — E3.2 Ingest API (KAN-32)

- **Last completed:**
  - Implemented **KAN-32** (`POST /v1/ingest/(events|entities|measures)`: batch validation,
    idempotency, `202 + batch_id`, per-record results; plan `13 §E3.2`/`12 §2`), the natural next
    sprint-2 pick — first real consumer of KAN-28's key service and KAN-31's Schema Registry.
    - `packages/firebase-orm-models`: new `IngestBatchModel` (one document per batch,
      `organizations/:organization_id/projects/:project_id/ingest_batches`, per-record results
      embedded as `record_results`) and `IngestDedupKeyModel` (a SHA-256 hash of
      `environment_id:kind:schema_name:client_id` used *as the document id*, so a duplicate check
      is a single point read, not a query — the shape the AC's "1k events/s sustained" load-test
      needs). New `ingest.service.ts`: `ingestBatch` validates each record's fields against
      `getActiveSchemaDefinition` (KAN-31) — missing required fields, type mismatches, and fields
      not declared on the schema all quarantine just that one record (plan `08 §2`: "unknown
      fields are quarantined, not dropped"), never failing the whole batch. Idempotency key is the
      client-supplied `event_id`/`id`; measures carry no client id in the plan's own sketch, so a
      deterministic key derived from `measure|ts|canonicalized-dimensions` stands in.
      `getIngestBatch` is the `GET /v1/ingest/batches/{batch_id}` read side, scoped to the caller's
      own org/project/environment (a batch from a sibling project/environment returns `null`, same
      404-not-403 posture as every other cross-tenant lookup here).
    - `key.service.ts` (KAN-28) gains `authenticateApiKey(rawKey, requiredScope)` alongside the
      existing `verifyApiKeyForRequest`: the plan's ingest routes are flat (`/v1/ingest/events`, no
      org/project/environment in the URL — matching its own "curl a custom event" phase-0 demo), so
      there's no path segment to check a key's claimed scope *against*. The new function resolves
      org/project/environment straight from the key's own hash lookup instead, refactored to share
      `findLiveApiKeyByRawKey`/`toApiKeyAuthContext` with the existing function rather than
      duplicating the hash-lookup-and-revoked-check logic.
    - `apps/api`: first real feature module in this NestJS app. `IngestController`
      (`POST .../ingest/(events|entities|measures)`, `GET .../ingest/batches/:batchId`), gated by a
      new `ApiKeyAuthGuard` + `@RequireApiKeyScope('ingest.write')` — a bearer-key guard,
      deliberately separate from the human/service-account `PermissionGuard` (an API key has no
      `Principal`/`PolicyBinding` to check), mirroring `PermissionGuard`'s own 401-vs-403 split: no
      usable credential at all (missing header, unknown/revoked key) is 401; a live key missing the
      required scope is 403. Every ingest route is `@Public()` (satisfying `PermissionGuard`'s
      deny-by-default check and the `growthos/require-permission-annotation` lint rule) and gated
      instead by the new guard via `@UseGuards`.
    - `apps/api` now runs its own test suite against a **real Firestore emulator** (new
      `apps/api/firebase.json`/`firestore.rules`, port 8100 — distinct from `packages/firebase-orm-
      models`'s 8080 and `apps/web`'s 8090; `turbo.json` gained `@growthos/api#test`'s own
      `dependsOn: [..., "@growthos/firebase-orm-models#test"]` entry serializing it after that
      package's own emulator run, same reasoning as the existing `@growthos/web#test` entry) rather
      than mocking `@growthos/firebase-orm-models` — a real `INestApplication` + real HTTP + real
      emulator e2e suite (`ingest.controller.e2e.spec.ts`), since this repo's own history is full of
      auth/wiring bugs that only a real e2e run (not lint/typecheck/mocked-unit-tests) catches.
      `apps/api/package.json` gained a real dependency on `@growthos/firebase-orm-models` (it only
      had `@growthos/shared` before) and a `firebase-tools` devDependency for the emulator CLI.
  - **Independent 4-angle review** (line-by-line, removed-behavior, cross-file, cleanup/altitude/
    conventions combined) before opening the PR. Found and fixed:
    - `dedupKeyId` hashed only `(environment, kind, client_id)`, omitting the record's own schema
      name — so two different entity types (or event names) sharing the same client-supplied id in
      one environment would wrongly dedupe against each other (e.g. a `product` and a `customer`
      both using natural id `123`). Now hashes `(environment, kind, schema_name, client_id)`.
    - The measure dedup key's `sortedJson` canonicalized only the dimensions map's top-level keys,
      so a nested dimension object (e.g. `{campaign: {id, name}}`) could hash differently across two
      semantically-identical resends that merely reordered the nested keys, silently dodging dedup.
      `canonicalize` now sorts recursively at every nesting level.
    - A whitespace-only client id (e.g. `event_id: "   "`) passed the fallback-id's `.length > 0`
      check even though the presence check (`.trim().length > 0`) had already quarantined the
      record, so the per-record result reported the literal whitespace string instead of the
      deterministic `#index` fallback. Unified both checks behind one `requireNonEmptyString` helper.
    - Schema-definition lookups ran one `await` per record inside the main loop instead of being
      prefetched in parallel for every distinct schema name a batch actually touches — fixed for the
      load-test-AC'd hot path (a batch spanning *k* distinct names now costs one round of *k*
      concurrent reads, not up to *k* sequential ones).
    - Dedup-key claim writes (the accepted records' idempotency-key persistence, run *after* the
      batch document is already durable) are now best-effort per record (caught, not propagated) —
      a transient write failure there no longer turns an otherwise-successful `202` into an
      unhandled `500`; it only means a later duplicate of that one record might slip through
      unnoticed, the same kind of eventual-consistency tradeoff already accepted for the
      known/documented concurrent-accept race (same class as KAN-31's non-transactional
      active-version read).
    - Consolidated three index-aligned parallel arrays (`prepared`/`dedupIds`/`existingClaims`) into
      one array of per-record objects, removing a latent desync risk for future edits.
    - Regression tests added for all of the above (entity-type cross-collision, nested-dimension
      canonicalization, whitespace-only id fallback) in the emulator suite.
    - **Reviewed and deliberately left as-is**: wrapping `apps/api`'s test script in a real Firestore
      emulator (rather than mocking) is a first for this app but matches `apps/web`'s own precedent
      exactly and is provisioned identically in CI (Java + cached emulator jars already set up); a
      couple of very small (3-line) hashing/plain-object-check helpers duplicated once each between
      `key.service.ts`/`ingest.service.ts` and `ingest.service.ts`/`ingest-request.ts` weren't worth
      introducing new shared-module abstractions for in this diff.
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green after every fix round (159
    tests in `packages/shared`, 91 in `packages/firebase-orm-models` incl. the new
    `ingest.emulator.test.ts` (16 tests) and 4 new `authenticateApiKey` tests, 29 in `apps/api` incl.
    the new `api-key-auth.guard.spec.ts` and `ingest.controller.e2e.spec.ts`, 223 web unit/route
    tests + 13/13 Playwright e2e in `apps/web`). One transient run of the documented gRPC
    `RESOURCE_EXHAUSTED` Firestore-emulator flake (in an unrelated, pre-existing test) self-recovered
    on retry, same as every prior run's entry.
  - **Found and closed a duplicate**: an independent run today had already opened **PR #18** for
    this exact story under the identical branch name `kan-32-ingest-api` — a `git push` rejection
    (not a merge conflict on `main`; the branch itself already existed with different commits) is
    what surfaced it, the same "KAN-20 problem" this file has documented before. Compared the two
    implementations directly before deciding rather than assuming mine was better by default: #18's
    own dedup check (`wasAlreadyAccepted`) had the *identical* cross-schema-name collision bug listed
    above, unfixed; it nested `organizationId`/`projectId`/`environmentId` into the URL rather than
    the plan's literal flat `/v1/ingest/events` contract (a real product/API-contract concern, not
    just style — the plan's own phase-0 demo is "curl a custom event" with just a key, no ids to
    look up first); and its `apps/api` tests mocked `@growthos/firebase-orm-models` rather than
    exercising a real emulator end-to-end. Its one genuine advantage — persisting each record's full
    raw payload — is arguably out of this story's scope (that's KAN-33's "accepted records → Pub/Sub
    → BigQuery raw tables" job). Renamed my branch to `kan-32-ingest-api-flat-url`, opened PR #19
    referencing this comparison, closed #18 with an explanatory comment, matching the KAN-29 entry's
    established reconciliation precedent (closing its own duplicate PR #14).
  - Branch `kan-32-ingest-api-flat-url`, PR #19. CI green (`lint · typecheck · test · build`,
    `mergeable_state: clean`) on the first attempt — no stall/flake this run. Merged (squash) into
    `main`. Remote branch deletion failed with the same HTTP 403 from this sandbox's git remote
    recorded in every prior run's entry (not a GitHub permissions issue) — merged and dead but not
    deleted.
- **In progress (exact stopping point):** none — KAN-32 is fully delivered, independently reviewed,
  tested, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** **KAN-33** (pipeline: accepted records → Pub/Sub → BigQuery raw tables) is the
  natural next pick — it's the direct downstream consumer of this story's `ingestBatch`/
  `IngestBatchModel` and is what would let an "accepted" record actually land somewhere queryable
  (right now KAN-32's `record_results` only ever stores validation status, not the raw payload —
  worth keeping in mind when KAN-33 is designed: either persist the raw payload somewhere durable
  before/as part of publishing to Pub/Sub, or accept that pre-KAN-33 "accepted" submissions are
  unrecoverable once this story's batch documents are the only record of them). **KAN-35** (Admin
  UI: ingest health) and **KAN-34** (quarantine/DLQ/rate-limiting) are also sprint-2/3 and downstream
  of this story. The real "1k events/s" load test from this story's own AC still needs actual
  staging infra (KAN-18, `needs-human`) to run against — not something a future run can satisfy
  without that.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding,
    unchanged by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-32-ingest-api-flat-url` branch on GitHub (this sandbox's git
    remote rejected the delete with a 403), and the other still-outstanding merged branches from
    prior runs noted in earlier entries below.

---

## 2026-07-06 — E3.1 Schema Registry (KAN-31)

- **Last completed:**
  - Implemented **KAN-31** (E3.1 Schema Registry, plan `13 §E3`/`08 §1`, AC: "register v1 -> evolve
    to v2 -> both queryable; breaking change rejected"), the natural next pick — sprint-2, no
    unfinished blockers, next in line after KAN-28/29/30.
    - `packages/firebase-orm-models`: new `SchemaDefModel`
      (`organizations/:organization_id/projects/:project_id/schema_defs`) — one document *per
      version* of an entity/event/measure schema family (identified by `(project_id, kind, name)`),
      with typed fields (`string`/`number`/`boolean`/`timestamp`/`object`/`array`), each carrying
      `is_required`/`is_pii`/`is_identity_key` flags. The model field is named `field_defs`, not
      `fields` — `@arbel/firebase-orm`'s `@Field` decorator stores its own per-class field metadata
      on a `fields` property of the model's prototype, so a model field actually named `fields`
      collides with it (surfaced as a confusing "Cannot read properties of undefined" at
      class-decoration time the first time this was tried).
    - New `schema-registry.service.ts`: `registerSchemaDefinition` (v1), `evolveSchemaDefinition`
      (v{n+1}, previous version kept as `status: 'superseded'` — never mutated or deleted, so both
      stay independently queryable, same "immutable version history" reasoning as
      `ResourceTemplateModel`'s version-pin). Non-breaking-evolution rule (`findBreakingChanges`):
      removing an existing field, changing its type, tightening optional->required, or dropping
      `is_identity_key` are all rejected with the specific violation(s); a brand-new field is only
      allowed if optional (a new required field would invalidate payloads already shaped for the
      previous version). `listSchemaDefinitionsForProject` (admin browse) /
      `listSchemaDefinitionVersions` / `getActiveSchemaDefinition` (the shape a future KAN-32 ingest
      validator would consume) round out the read side.
    - `apps/web`: a project-scoped Schema Registry page (`orgs/:orgId/projects/:projectId/schema-defs`),
      gated on the existing `schema.write` permission (already in the catalog, granted to
      `platform_admin`/`org_owner`/`org_admin`/`project_admin`) — register a new schema with a field
      builder (name/type/required/PII/identity-key checkboxes), see every version of every family in
      a table, and evolve a family via a form prefilled from its latest version's fields. New routes
      `GET/POST .../schema-defs` and `POST .../schema-defs/evolve`. Full en/he translations; schema
      kind/field-type values render as raw technical strings (untranslated), matching the existing
      `CREDENTIAL_PROVIDERS` precedent in `create-credential-form.tsx`.
    - Tests: Firestore-emulator coverage for register/evolve/list (every breaking-change rule
      individually, the "both versions queryable" AC, cross-project isolation), route tests,
      component tests, a KAN-26 non-enumeration isolation scenario for all three new routes, and an
      e2e spec (`e2e/schema-registry.spec.ts`) driving register -> evolve -> breaking-change-rejected
      through a real browser. Two real UI bugs caught only by that e2e run (not by lint/typecheck,
      which stayed green through both): a `getByLabel('Name')` Playwright locator ambiguity from
      substring matching against the "Field name" input (fixed with `exact: true`), and — the more
      substantive one — `EvolveSchemaDefForm` staying mounted with stale local state after a
      successful evolve, because `router.refresh()` alone doesn't unmount a client component at the
      same key/position in its parent's list; a second "Evolve" click was reusing the still-open,
      stale form instead of a fresh one. Fixed by adding an explicit `onClose` callback the form calls
      after a successful submit (merged with the existing cancel callback, since both do the same
      "hide this form" thing).
  - **Independent 8-angle review** (line-by-line, removed-behavior, cross-file, reuse,
    simplification, efficiency, altitude, CLAUDE.md conventions; each ran on the full diff and its
    own dedicated fan-out) before merging. Findings corroborated by 3-4 angles each, all fixed:
    - `evolveSchemaDefinition` was missing the empty-name validation `registerSchemaDefinition`
      enforced (an empty name would silently 404 as "not found" instead of 400 "invalid") — both now
      share one validation path (`validateSchemaDefRequest`) and one version-document constructor
      (`buildSchemaDefVersion`), closing the drift and cutting ~20 duplicated lines.
    - The page's `groupIntoFamilies` re-implemented the `SchemaFieldDef` -> view mapping the API
      routes' `toSchemaDefView` already centralizes — now reuses it; `schema-def-view.ts`'s types
      tightened from loose `string` to the real `SchemaDefKind`/`SchemaDefStatus`/`SchemaFieldType`
      unions.
    - A few sequential independent Firestore reads (`listOrgProjects` + `listSchemaDefinitionsForProject`
      in the GET route and the page) now run via `Promise.all`; the existence/latest-version lookups
      in register/evolve now use targeted `.limit(1)` queries instead of fetching and sorting the full
      version history.
    - The register/evolve routes' duplicated kind/name/fields request-parsing block was extracted
      into one shared `parseSchemaDefRequestBody` helper.
    - Added isolation-test coverage for the GET list and evolve routes (previously only the register
      route had a KAN-26 non-enumeration regression test).
    - **Documented, not fixed**: neither `registerSchemaDefinition` nor `evolveSchemaDefinition` is
      transactional — two concurrent calls for the same schema family can each pass their respective
      read-then-write check (existence / breaking-change) before either writes, producing two
      documents both claiming to be the current version. A real fix needs a Firestore transaction,
      which this package's own convention (`firestore-connection.ts`'s doc comment: "the only place
      in the codebase that touches the raw firebase/app/firebase/firestore client SDK directly")
      reserves to that one file — bigger than this story; flagged in both functions' doc comments as
      a known, deliberately-deferred gap for whoever next touches this service (plausibly KAN-32,
      which needs a consistent single-active-version read anyway).
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green after every fix round (74
    tests in `packages/firebase-orm-models` incl. the new schema-registry emulator suite, 15 in
    `apps/api`, 223 web unit/route tests + 13/13 Playwright e2e in `apps/web` incl. the new
    `e2e/schema-registry.spec.ts`). The documented gRPC `RESOURCE_EXHAUSTED` Firestore-emulator flake
    hit twice during this run (once locally in an unrelated suite, once in CI in
    `org-membership-flows.emulator.test.ts` — not touched by this diff) and self-recovered on retry
    both times, same as every prior run's entry.
  - Branch `kan-31-schema-registry`, PR #17. First CI attempt failed on exactly that
    `RESOURCE_EXHAUSTED` flake in an unrelated pre-existing test; re-ran via `rerun_failed_jobs`, the
    second attempt completed clean (`mergeable_state: clean`). Merged (squash) into `main`. Remote
    branch deletion failed with the same HTTP 403 from this sandbox's git remote recorded in every
    prior run's entry (not a GitHub permissions issue; no branch-delete tool exists in the GitHub MCP
    server either) — merged and dead but not deleted.
- **In progress (exact stopping point):** none — KAN-31 is fully delivered, independently reviewed,
  tested, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** **KAN-32** (`POST /v1/ingest/(events|entities|measures)`: batch validation,
  idempotency, 202 + `batch_id`, per-record results) is the natural next sprint-2 pick — it's the
  first real consumer of KAN-28's `verifyApiKeyForRequest` (no route calls it yet) and this story's
  `getActiveSchemaDefinition`/`SchemaFieldDef` shape (validate an incoming record's fields against the
  active schema version). Two things worth carrying into that story: (1) the concurrent-evolve/register
  race documented above — KAN-32 will want a single, consistent "the active version" read, so it's a
  natural place to either accept the same eventual-consistency tradeoff explicitly or finally add the
  transaction; (2) `getActiveSchemaDefinition`'s current shape (returns the whole `SchemaDefModel`) is
  probably fine as-is for a validator to consume directly. **KAN-35** (Admin UI: ingest health) and
  **KAN-33/34** (pipeline, quarantine/DLQ/rate-limiting) are sprint-2/3 and downstream of KAN-32.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding,
    unchanged by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-31-schema-registry` branch on GitHub (this sandbox's git remote
    rejected the delete with a 403), and the other still-outstanding merged branches from prior runs
    noted in earlier entries below (`kan-29-vault-kms-envelope-encryption`, `kan-29-kms-vault-module`,
    and further back).

---

## 2026-07-06 — E2.2 KMS envelope encryption vault module (KAN-29)

- **Last completed:**
  - Implemented **KAN-29** (E2.2 KMS envelope encryption for OAuth tokens/secrets — vault module;
    plan `13 §E2`, AC "Secrets unreadable in Firestore dump; rotation test passes"), the natural
    next pick after KAN-30 now that all sprint-2 predecessors were done.
    - `packages/firebase-orm-models/src/vault/`: a provider-agnostic envelope-encryption module.
      Each secret gets a fresh random data-encryption-key (DEK, AES-256-GCM); the DEK is wrapped by
      a `KmsProvider`. `LocalKmsProvider` (the implementation available today) derives a per-tenant
      subkey via HKDF from a versioned key ring read from `GROWTHOS_VAULT_KEYS` — the same
      "buildable today" stand-in KAN-28 used for its own key hashing, until KAN-18 provisions the
      real GCP project a `GcpKmsProvider` would talk to. Both the KMS-wrap and the envelope's own
      AES-GCM cipher bind to an org+credential id via additional authenticated data (a shared
      `aes-gcm.ts` primitive), so cross-tenant/cross-credential decryption fails closed rather than
      relying only on application code. Rotation (`rotateSecretEnvelopeKey`) only re-wraps the DEK,
      never re-encrypts the secret ciphertext.
    - `packages/firebase-orm-models`: `SharedCredentialModel` (KAN-27) gains an `encrypted_secret`
      field; new `vault.service.ts` provides `setSharedCredentialSecret` /
      `revealSharedCredentialSecret` / `rotateSharedCredentialSecretKey` — closing the "wiring an
      actual OAuth token in is a follow-up once KAN-29 lands" note left on that model.
    - `apps/web`: a write-only "set/update secret" form + a "rotate key" button on the org resource
      library page (never returns the decrypted value, same shape as a password field), both gated
      on `resources.manage`. New routes `PUT .../credentials/[credentialId]/secret` and
      `POST .../credentials/[credentialId]/secret/rotate`. New `GROWTHOS_VAULT_KEYS` env var
      documented in `apps/web/.env.example`. Full en/he translations.
    - Tests: pure-unit crypto tests (round-trip, tamper detection, cross-tenant failure, key
      rotation incl. full old-key retirement, env-var validation), a Firestore-emulator test doing
      a **raw document read** to prove only ciphertext is ever stored (the literal AC), and
      route/component tests for the new admin-UI surface.
    - Self-review (8 finder angles: line-by-line, removed-behavior, cross-file, reuse,
      simplification, efficiency, altitude, CLAUDE.md conventions) found and fixed: no AAD binding
      on the envelope's own cipher (fixed, and extracted a shared `aesGcmSeal`/`aesGcmOpen`
      primitive instead of two independent AES-GCM implementations in `envelope.ts` and
      `local-kms-provider.ts`); `GROWTHOS_VAULT_KEYS`'s `currentKeyId` wasn't validated against its
      own `keys` map (fixed — was surfacing as an uncaught error instead of a clean 500); a
      redundant Firestore write on a no-op key rotation (fixed); and — flagged independently by two
      review angles — no admin surface existed for `rotateSharedCredentialSecretKey`, a CLAUDE.md
      "everything user-manageable gets an admin surface" violation (fixed by adding the rotate
      route + UI button above). Several other candidate findings (KmsProvider/WrappedDek interface
      "unjustified" since only one implementation exists, `tenantId` naming, `dek.fill(0)`
      best-effort zeroing, `apps/web/lib/vault/kms-provider.ts` re-parsing env per request) were
      reviewed and deliberately left as-is — reasoning is in the PR discussion, not repeated here.
  - Merged as PR #16, `main` fast-forwarded locally to confirm.
  - **Found and closed a duplicate**: PR #14 (`kan-29-kms-vault-module`), an independent,
    already-complete implementation of this same story from an earlier run today, was left open
    and unmerged with `TASKS.md` never updated to reflect it — so this run picked the same "todo"
    story unaware it existed. Closed #14 as superseded by #16 once this run's version merged (same
    "the KAN-20 problem": an earlier run's finished-but-unmerged branch that never got reconciled).
    **Both stale branches (`kan-29-vault-kms-envelope-encryption`, `kan-29-kms-vault-module`) could
    not be deleted** — `git push --delete` returned an HTTP 403 from the git proxy in this
    environment, and no branch-delete GitHub MCP tool was available this run. They're harmless
    (unreferenced by any open PR) but a human or a future run with working branch-delete access
    should clean them up.
- **In progress (exact stopping point):** none — task fully delivered, merged, and documented.
- **Blocked + why:** n/a.
- **Next step:** pick the next unblocked sprint-2/3 `todo` story (e.g. KAN-31 Schema Registry or
  KAN-32 ingest API — both sprint 2/3, no unfinished blockers). Also worth a stale-branch sweep
  across the repo (KAN-20 already has 3 unreconciled branches; this run added 2 more undeletable
  ones) — a human with branch-delete access, or a future run that finds one, should prune
  `kan-29-vault-kms-envelope-encryption` and `kan-29-kms-vault-module`.
- **Waiting on human:** deleting the two stale branches above (git-proxy permissions blocked it
  from this run); everything else in the `Human-action queue` in TASKS.md is unchanged.

---

## 2026-07-06 — E2.3 Admin UI: keys page (KAN-30)

- **Last completed:**
  - Implemented **KAN-30** (Admin UI: keys page — create with scope picker, copy-once display,
    revoke, last-used; plan `12 §1`/`13 §E2`), the natural next pick now that KAN-28 supplies the
    service layer it needs.
    - `apps/web`: new `orgs/:orgId/projects/:projectId/keys` page — mint a key scoped to one
      environment with a least-privilege scope checkbox picker over `API_KEY_SCOPES`, list every
      key ever minted (active or revoked) with its display-safe `key_prefix` and last-used time,
      and revoke one immediately. Unlike KAN-27's resource library (any active member can browse),
      the **whole feature — page and both new API routes — is gated on `keys.manage`**: a key's
      scope list and usage metadata are sensitive enough that only roles trusted to manage keys
      should see them at all, matching the story's own "Admin UI" framing.
      New routes `orgs/[orgId]/projects/[projectId]/keys` (GET list/POST mint) and
      `.../keys/[apiKeyId]` (DELETE revoke). New components: `CreateApiKeyForm` (name + environment
      select + scope checkboxes), `MintedApiKeyDisplay` (the "copy this key now — it won't be
      shown again" one-time secret view, with a copy-to-clipboard button), `RevokeApiKeyButton`.
      Wired into the org detail page (a new "API keys" link, gated the same way). New `ApiKeys`
      translation namespace, en + he.
    - `packages/firebase-orm-models`: new `listEnvironmentsForProject` query
      (`organization.service.ts`) — nothing previously re-listed a project's fixed dev/staging/prod
      environments by id; needed to resolve `environmentId` for the create-key picker.
    - **Deliberately out of scope**, matching the plan's own "audit entries written" AC bullet: no
      audit-log entries are written for mint/revoke, since the audit log service (**KAN-44**)
      doesn't exist yet — same "buildable today" split KAN-23/KAN-27 used for their own
      not-yet-built dependencies.
  - **Two real bugs caught and fixed during implementation, before the diff settled** (found by
    actually running the e2e suite against a real `next dev` build, not just typecheck/lint, which
    both stayed green through both bugs):
    - `CreateApiKeyForm` (a client component) originally imported `API_KEY_SCOPES`/`ApiKeyScope`
      from `@growthos/firebase-orm-models`, which transitively re-exports `key.service.ts` — and
      that module's `node:crypto` usage doesn't exist in a browser bundle, so webpack failed the
      client build (`UnhandledSchemeError: Reading from "node:crypto"`) the moment the page was
      actually hit. Fixed by importing from `@growthos/shared` directly instead, the same thing
      `invite-member-form.tsx` already does for `INVITABLE_ROLES` — client components must only
      ever pull scope/role vocabulary from the pure `@growthos/shared` package, never from
      `@growthos/firebase-orm-models`, whose index also drags in server-only service code.
    - The keys page passed `EnvironmentModel[]` (an `@arbel/firebase-orm` class instance array)
      directly as a prop from the server page into the `CreateApiKeyForm` client component. Class
      instances aren't serializable across the React Server Components boundary, and this crashed
      at runtime with `RangeError: Maximum call stack size exceeded` (an "Application error" page)
      the first time the keys page was actually rendered in a browser — invisible to `tsc`/`eslint`
      since nothing type-checks RSC serializability. Fixed by mapping to a plain `{id, name}[]`
      before passing it down, the same reason `ProjectSwitcher` stays an `async` **server**
      component instead of ever forwarding a `ProjectModel[]` across a client boundary. Takeaway for
      future stories: any new "pass an org/project/environment list into a client form" pattern
      needs its data mapped to plain objects first, and a real e2e run (not just lint/typecheck) is
      what actually catches this class of bug.
  - **Independent 5-angle review** (3 correctness angles + cleanup/reuse/efficiency +
    altitude/CLAUDE.md-conventions) before opening the PR. It confirmed the copy-once secret display
    is architecturally sound (the raw key lives only in transient client state, is never persisted,
    and dismissing it is final — `listApiKeysForProject` never returns it) and that permission gating
    is consistent across the page and both routes. It found, and this run fixed:
    - `GET .../keys` validated `keys.manage` on the org but never that `projectId` actually belonged
      to it, so a project id from a different org silently returned `200 { apiKeys: [] }` instead of
      the `404` its own sibling `POST` (via `mintApiKey`'s `ProjectNotFoundError`) and `DELETE` (via
      `revokeApiKey`'s `ApiKeyNotFoundError`) return for the same input — two independent finder
      angles converged on this same inconsistency. Fixed by adding the same `listOrgProjects`-based
      existence check the page itself already used, plus a regression test.
    - **Reviewed and deliberately not changed**, each matching an existing codebase precedent rather
      than a gap introduced by this story: scope identifiers (`ingest.write`, etc.) render
      untranslated as technical values, same as `CREDENTIAL_PROVIDERS` values in
      `create-credential-form.tsx`; revoke fires immediately with no confirm dialog, same as
      `DetachAttachmentButton`/`RemoveMemberButton`; the new `listApiKeysForProject`/
      `listEnvironmentsForProject` wrappers in `queries.ts` have no dedicated unit test, same as
      every other thin delegating wrapper in that file (only `getInviteDetails`, which has real
      logic, gets one); the new `isolation.test.ts` scenario only exercises the fake-org-id
      enumeration boundary, same shape as every other scenario in that file — real cross-org key
      isolation is already covered at the service layer by KAN-28's own
      `key.emulator.test.ts` ("rejects a key presented against the wrong project").
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green after every fix round (46
    tests in `packages/firebase-orm-models` incl. the new `listEnvironmentsForProject` coverage, 159
    in `packages/shared`, 15 in `apps/api`, 184 web unit/route tests + 12/12 Playwright e2e in
    `apps/web` incl. the new `e2e/keys.spec.ts` covering the full mint → copy → dismiss → revoke
    lifecycle). One transient run of the documented gRPC `RESOURCE_EXHAUSTED` Firestore-emulator
    flake self-recovered on retry, same as every prior run's entry.
  - Branch `kan-30-keys-admin-ui`, PR #15, CI green (`lint · typecheck · test · build`,
    `mergeable_state: clean`), merged (squash) into `main`. Remote branch deletion failed with the
    same HTTP 403 from this sandbox's git remote recorded in every prior run's entry (not a GitHub
    permissions issue) — merged and dead but not deleted.
- **In progress (exact stopping point):** none — KAN-30 is fully delivered, independently reviewed,
  tested, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** **KAN-29** (KMS envelope encryption / vault module) is the natural next pick — it's
  what would let KAN-27's `SharedCredentialModel` actually grow a real secret field, worth doing
  before or alongside whichever story first needs to store a real OAuth token (KAN-49 Stripe plugin,
  sprint 4). **KAN-31** (Schema Registry) is the next sprint-2 `todo` after that if picking something
  not on the keys/resources/vault track. The `project.manage`-without-`projectId` gap documented in
  the KAN-27 entry below remains open and unrelated to this story.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding,
    unchanged by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-30-keys-admin-ui` branch on GitHub (this sandbox's git remote
    rejected the delete with a 403, and the GitHub MCP server has no delete-branch tool either), and
    the other still-outstanding merged branches from prior runs noted in earlier entries below.

---

## 2026-07-05 — E2.1 Key service (KAN-28)

- **Last completed:**
  - Implemented **KAN-28** (Key service, plan `12 §1` / `06 §1`, task-breakdown E2.1), scoped to the
    service layer per its AC ("key auths a request; wrong env/project/scope -> 403; revoke is
    immediate"):
    - `packages/firebase-orm-models`: new `ApiKeyModel`
      (`organizations/:organization_id/projects/:project_id/api_keys`) — persists only a SHA-256
      `hashed_secret`, never the raw key; `key_prefix` holds a short display-safe slice (the
      `gos_live_`/`gos_test_` prefix + a few random chars) for a future admin list, the same
      "copy-once" pattern Stripe/GitHub use for their own tokens. New `key.service.ts`:
      `mintApiKey` (validates the project/environment belong together, mints a key via
      `node:crypto randomBytes`, prefixed by `apiKeyModeForEnvironment` — prod -> `gos_live_`,
      dev/staging -> `gos_test_` — returns the raw key once, never retrievable again),
      `verifyApiKeyForRequest` (looks up by hash via a Firestore collection-group query, then
      checks org/project/environment match, not-revoked, and required scope; returns a `Result`
      rather than throwing so a future guard layer can map every rejection to 403 uniformly;
      re-reads `revoked_at` on every call so revocation is immediate — no cache to invalidate),
      `revokeApiKey` (idempotent), `listApiKeysForProject` (an `ApiKeySummary` view that never
      exposes `hashed_secret`).
    - `packages/shared`: `apiKeyModeForEnvironment()` (`ids.ts`, next to the pre-existing
      `API_KEY_PREFIXES`/`apiKeyMode` scaffolding from the KAN-79 bootstrap) and a new
      `policy/api-key-scopes.ts`: `API_KEY_SCOPES`, a curated least-privilege subset of the full
      `Permission` catalog appropriate for a machine-held key — withholds
      `project.manage`/`members.manage`/`billing.manage`/`resources.manage`/`sources.manage`
      (org/project administration), `keys.manage` (a key must not mint/revoke other keys),
      `automation.approve`/`automation.execute` (plan 06 §3's "separate, elevated scope" for
      money-moving actions), `pii.read` (plan 08 §5.4's separate PII gate), and `plugin.install`.
      Same "least privilege for a non-human principal" reasoning as `INVITABLE_ROLES`.
  - **Independent subagent review** before merging. It confirmed the collection-group lookup is
    correct despite the model's two-level dynamic path, revocation has no TOCTOU gap (`save()`
    never silently clears a concurrently-set `revoked_at`), and the raw key is never logged or
    persisted anywhere but the one-time mint return value. It found, and this run fixed:
    - `API_KEY_SCOPES`'s doc comment and test omitted `sources.manage` from the withheld list (it
      was already correctly excluded, just undocumented) — added, plus a new test asserting
      `API_KEY_SCOPES` is an exact partition of the full `Permission` catalog (every permission is
      in exactly one of "grantable to a key" or "withheld"), so a future permission added to
      neither list — or to both — now fails a test instead of drifting silently.
    - The hash lookup fetched all matching docs instead of limiting to one — added `.limit(1)`.
    - Missing test coverage for a multi-scope key authenticating against its *second* scope (only
      the first was ever checked) and for one key's revocation not affecting a sibling key in the
      same project — both added to `key.emulator.test.ts`.
    - **Reviewed and deliberately not applied**: dropping a redundant `.where('project_id', ...)`
      in `listApiKeysForProject`. Checked against this ORM's type declarations first — `.get()`
      only exists on a `Query` object entered via `.where()`, not on the bare model instance
      `initPath()` returns, so removing it would have broken the call, not just left dead weight.
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green after every fix round (159
    tests in `packages/shared`, 45 in `packages/firebase-orm-models` incl. the new key-service
    emulator suite — mint, multi-scope auth, wrong-project/environment/scope rejection, immediate
    revoke, sibling-key isolation, hash never leaked via the summary view — 15 in `apps/api`, 164
    web unit/route tests + 11/11 Playwright e2e in `apps/web`).
  - Branch `kan-28-key-service`, PR #13. GitHub Actions CI's first attempt stalled on the `Test`
    step for a couple of minutes with no error (same class of transient runner flake documented in
    earlier entries below) — cancelled and re-ran once; the second attempt completed clean in
    under 5 minutes (`Test` 2m42s, `Build` 30s). Verified the PR's `mergeable_state` was `clean`
    before merging (squash) into `main`. Remote branch deletion failed with the same HTTP 403 from
    this sandbox's git remote recorded in every prior run's entry (not a GitHub permissions issue;
    no branch-delete tool exists in the GitHub MCP server either) — merged and dead but not
    deleted.
  - **Deliberately out of scope for this story** (same "buildable today" split KAN-23's policy
    engine used before KAN-24 wired it into routes): no HTTP route/guard calls
    `verifyApiKeyForRequest` yet (there's no ingest API to protect — that's KAN-32), and no admin
    UI for creating/listing/revoking keys — that's the dedicated next story, **KAN-30**, which
    TASKS.md already describes as depending on this one existing first.
- **In progress (exact stopping point):** none — KAN-28 is fully delivered for its service-layer
  scope, independently reviewed, tested, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** **KAN-30** (Admin UI: keys page — create with scope picker, copy-once display,
  revoke, last-used) is the natural next pick now that KAN-28 supplies the service layer it needs;
  it should call `mintApiKey`/`listApiKeysForProject`/`revokeApiKey` directly rather than
  duplicating any of that logic, and the admin surface should gate on the existing `keys.manage`
  permission (already in the catalog and granted to `org_owner`/`org_admin`/`project_admin`/
  `platform_admin`). **KAN-29** (KMS envelope encryption / vault module) is also unblocked and
  independent. **KAN-31** (Schema Registry) is the next sprint-2 `todo` after those if picking
  something not on the keys/resources track.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding,
    unchanged by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-28-key-service` branch on GitHub (this sandbox's git remote
    rejected the delete with a 403, and the GitHub MCP server has no delete-branch tool either),
    and the other still-outstanding merged branches from prior runs noted in earlier entries below.

---

## 2026-07-05 — E1.7 Org Resource Library (KAN-27)

- **Last completed:**
  - Implemented **KAN-27** (Org Resource Library, plan `08-generic-platform.md` §1.2), scoped to
    what's buildable today: shared connection credentials, templates, and the people registry, all
    attachable to projects with org-resource-owner approval and immediate detach revocation.
    - `packages/shared/src/policy`: new `resources.manage` permission — granted to
      `org_owner`/`org_admin`/`platform_admin` (via the existing `ALL_PERMISSIONS` composition, no
      manual per-role wiring needed), withheld from `project_admin`, matching the plan's
      "project-admin initiated + org-resource-owner approved" split (`project_admin` uses the
      existing `project.manage` to request an attachment instead).
    - `packages/firebase-orm-models`: four new models — `SharedCredentialModel` (name + provider +
      `available_scopes`, deliberately **no secret/token field** since real envelope-encrypted
      storage is KAN-29/KMS, which doesn't exist yet), `ResourceTemplateModel` (versioned, opaque
      `config` blob), `OrgPersonModel` (`dim_team_member`), and one shared `ResourceAttachmentModel`
      driving the request/approve/reject/detach lifecycle identically across all three kinds (kept
      as `detached` rather than deleted, for the per-project usage audit trail the plan calls for).
      `resource-library.service.ts` validates a credential attachment's requested scope selection is
      a genuine subset of the credential's `available_scopes`, and records a template attachment's
      `version` at request time (`resource_version`) so a later org-admin edit to the template
      doesn't silently reshape an already-approved attachment ("copy-with-link + version pin").
    - `apps/web`: a new `requireOrgMembership` helper next to `requireOrgPermission`
      (`lib/orgs/access.ts`) for read routes any active member should hit regardless of role — a
      `viewer` legitimately holds zero explicit permissions in `ROLE_PERMISSIONS` but should still be
      able to browse the library to pick something to request; both helpers preserve the KAN-26
      404-not-403 non-enumeration property, and `route-isolation-guard.test.ts` now recognizes either
      gate. New routes under `orgs/[orgId]/resources/{credentials,templates,people}`,
      `orgs/[orgId]/projects/[projectId]/resource-attachments`, and
      `orgs/[orgId]/resource-attachments/[attachmentId]`. New UI: an org resource-library page
      (browse + create + approval queue, gated on `resources.manage`) and a per-project resources
      page (browse + request + detach), linked from the existing org detail page.
  - **Independent subagent review** before merging (this run's own diff, not picking up unfinished
    work from a prior run this time). It confirmed cross-org IDOR is well-protected structurally
    (every new model lives in an `organizations/:organization_id/...` subcollection, so
    `Model.init(id, {organization_id})` against a foreign id simply can't resolve — the redundant
    `organization_id !== organizationId` guards in the service layer are defense in depth, not the
    only thing holding the line) and the 404-vs-403 convention holds throughout. It found, and this
    run fixed:
    - `ResourceTemplateModel`'s own doc comment overclaimed "copy-with-link + version pin" behavior
      that wasn't actually implemented (nothing recorded which version an attachment copied) — added
      `resource_version` and a regression test proving it survives a later edit to the template.
    - `OrgPersonModel.photo_url` was a half-wired dead field (modeled, never reachable from any
      route/form) — wired end-to-end.
    - Missing a dedicated `resources.manage` policy test (the `pii.read`-gate precedent), a whole-
      feature-area e2e scenario (the exact gap KAN-25's own review flagged and fixed for its area —
      added `e2e/resource-library.spec.ts` covering create credential → request scoped attachment →
      approve → verify the granted slice → detach), and isolation-suite coverage for the decide/detach
      route — all added.
    - **Flagged, deliberately not fixed** (pre-existing, not introduced by this story): every
      `project.manage` check in this repo — including the pre-existing project-creation route from
      KAN-25 and this story's new request-attachment route — calls `requireOrgPermission(orgId,
      'project.manage')` without a `projectId`, so the policy engine's `bindingCoversResource` can
      never match a *project-scoped* `project_admin` binding (only org-scoped bindings satisfy it
      today). Masked because nothing in this codebase provisions project-scoped bindings yet; real
      fix needs extending `requireOrgPermission`'s signature to accept a `projectId`, which is bigger
      than this story and affects every existing `project.manage` call site, not just KAN-27's.
    - While validating the new e2e spec, also caught (independent of the subagent review) and fixed a
      real bug: the project-resources page's `generateMetadata` called `t('title')` without the
      required `projectName` interpolation variable, throwing a next-intl `FORMATTING_ERROR` on every
      request (rendering still worked via next-intl's dev fallback, but this would be a hard crash or
      a broken `<title>` in a stricter/production config) — split into a separate non-interpolated
      `metaTitle` key.
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green after every fix round (154
    tests in `packages/shared`, 31 in `packages/firebase-orm-models` incl. the full request → approve
    → detach + scope-slicing + version-pin emulator suite, 15 in `apps/api`, 164 web unit/route tests
    + 11/11 Playwright e2e in `apps/web`).
  - Branch `kan-27-org-resource-library`, PR #12, merged (squash) into `main` after CI went green.
    Remote branch deletion failed with the same HTTP 403 from this sandbox's git remote recorded in
    every prior run's entry (not a GitHub permissions issue) — merged and dead but not deleted.
- **In progress (exact stopping point):** none — KAN-27 is fully delivered for its buildable-today
  scope, independently reviewed, tested, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** **KAN-28** (key service: mint per project+env, hashed storage, last-used tracking)
  and **KAN-30** (admin UI: keys page) are natural next sprint-2 `todo`s — KAN-30 depends on KAN-28
  existing first, so KAN-28 is the more immediately actionable pick. **KAN-29** (KMS envelope
  encryption / vault module) is also unblocked and is what would let KAN-27's `SharedCredentialModel`
  actually grow a real secret field — worth doing before or alongside whichever story first needs to
  store a real OAuth token (KAN-49 Stripe plugin is the first such story, sprint 4). The
  `project.manage`-without-`projectId` gap documented above is a real but non-urgent latent issue
  worth fixing whenever project-scoped role bindings are first introduced (no story currently on the
  board does that yet).
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding, unchanged
    by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-27-org-resource-library` branch on GitHub (this sandbox's git
    remote rejected the delete with a 403), and the other still-outstanding merged branches from prior
    runs noted in earlier entries below.

---

## 2026-07-05 — KAN-26 merge follow-up: CI stall had cleared, PR #11 merged

- **Last completed:**
  - Picked up where the previous run's entry (below) left off: it had implemented KAN-26 in full on
    PR #11 (`kan-26-hard-isolation`) but stopped short of merging after GitHub Actions CI stalled on
    the Test step three times in a row, and asked the repo owner whether to merge without a green
    check. Before acting on that ask, re-checked PR #11's actual state on GitHub per that entry's own
    "next step" instruction — the stall had cleared on its own: a fourth CI run
    (`lint · typecheck · test · build`) had completed with `conclusion: success` on the PR's head
    commit, and `mergeable_state` was `clean`. So the human decision the previous entry was blocked on
    was moot by the time this run checked; no unilateral "merge without CI" call was needed.
  - Didn't take the green check at face value: checked out `kan-26-hard-isolation` locally and reran
    `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` from a clean install (not
    reusing the sandbox's possibly-stale node_modules) — all green (144 tests in `packages/shared`,
    21 in `packages/firebase-orm-models` incl. the documented gRPC `RESOURCE_EXHAUSTED` flake
    self-recovering via retry as in every prior run, 15 in `apps/api`, 116 in `apps/web` + 11/11
    Playwright e2e with the one already-documented `auth.spec.ts` flake passing on its automatic
    retry). Also independently re-read the diff (`access.ts`'s 404/403 split, `isolation.test.ts`,
    `route-isolation-guard.test.ts`, `access.test.ts`) and the org-detail page's existing `notFound()`
    call — confirmed the 404-vs-403 split is applied consistently at every call site (all three
    mutating routes gate before body parsing; the KAN-25-era org-detail page already matched the new
    convention) before merging.
  - Merged PR #11 (squash) into `main`. Remote branch deletion failed with the same HTTP 403 from this
    sandbox's git remote recorded in every prior run's entry (not a GitHub permissions issue) — merged
    and dead but not deleted.
  - Takeaway for future runs: a "CI stalled, needs a human call" entry can go stale by the time the
    *next* run reads it — always re-check the PR's live state on GitHub before escalating further or
    re-doing work, per the previous entry's own advice.
- **In progress (exact stopping point):** none — KAN-26 is now fully delivered, independently
  re-verified, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** **KAN-27** (Org Resource Library) or **KAN-30** (keys admin UI) — both unblocked
  sprint-2 `todo`s that build on KAN-25/26's real membership/isolation layer. **KAN-28**/**KAN-29**
  (key service, KMS envelope encryption) are also sprint-2 `todo` and independent of KAN-26. Two small
  non-blocking follow-ups from the KAN-26 entry below remain open if anyone wants a quick pick-up:
  carrying the 404-vs-403 split into `apps/api`'s `PermissionGuard` once it has a real org-scoped
  route, and the `ensureUserForFirebaseSession` email-verification identity-merge gap noted in the
  KAN-25 entry further below.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding, unchanged
    by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-26-hard-isolation` branch on GitHub (this sandbox's git remote
    rejected the delete with a 403), and the other still-outstanding merged branches from prior runs
    noted in earlier entries below.

---

## 2026-07-05 — E1.6 Hard isolation & non-enumeration layer (KAN-26)

- **Last completed:**
  - Implemented **KAN-26** scoped to the surfaces that actually exist today: `apps/web`'s
    org/project/member/invite routes. Per `docs/plan/08-generic-platform.md` §5.6, the "scoped
    caches/search/notifications, per-project datasets" bullets in the story title reference systems
    (Metrics API, warehouse, Redis caches, search indexes) that don't exist yet — those are
    forward-looking for later epics, not buildable now; confirmed via an Explore-agent survey before
    starting so the scope decision is grounded in the plan text, not a guess.
  - `apps/web/lib/orgs/access.ts`'s `requireOrgPermission` used to return one 403 for both "org
    doesn't exist" and "org exists but caller has no active membership" *and* "caller is a member but
    lacks the specific permission" — collapsing all three into a single enumeration-revealing status.
    Split it: **no active membership → 404** (a real org the caller can't see is now indistinguishable
    from a fake org id), **membership exists but permission denied → 403** (not a leak — the caller
    already knows the org exists). This is the exact gap the KAN-25 org-detail page's own doc comment
    flagged as still-open ("the KAN-26 404 not 403 principle applies even before that story builds it
    out everywhere else").
  - Updated `apps/web/app/api/orgs/[orgId]/invites/route.test.ts`'s "no membership in the org at all"
    case, which had pinned the old 403 behavior, to assert 404 instead — this test would otherwise have
    actively encoded the enumeration bug it's supposed to catch.
  - Added `apps/web/lib/orgs/access.test.ts` coverage for `requireOrgPermission` itself (401/404/403/
    success), mocking session resolution so the branch logic is pinned directly, independent of the
    route-level integration tests.
  - Added `apps/web/lib/orgs/isolation.test.ts`: a cross-org isolation suite against the real Firestore
    emulator, the "isolation test suite in CI" AC from `docs/plan/13-task-breakdown.md`'s E1.6 row. For
    each of `POST /projects`, `POST /invites`, `DELETE /members/[membershipId]`, asserts a caller who's
    a real member of one org gets a byte-identical 404 response (status + body) whether the target is a
    second, genuinely-existing org they have no binding on, or a completely fabricated org id — the
    actual non-enumeration property, not just "both happen to return 404."
  - Added `apps/web/lib/orgs/route-isolation-guard.test.ts`: this repo has no per-route annotation
    system for `apps/web` the way `apps/api`'s `@RequirePermission` + `growthos/require-permission-
    annotation` eslint rule (KAN-24) does, so a custom lint rule wasn't the right tool here. Instead, a
    filesystem-scanning test walks every `route.ts` under `app/api/orgs` and `app/api/invites` and fails
    the suite if a file neither calls `requireOrgPermission` nor is in an explicit, justified
    `EXEMPT_ROUTES` allow-list (org-create — no target to enumerate; org-context — returns only the
    caller's own data; invite-accept — identity-scoped by design with its own 404 mapping). This is the
    practical, CI-enforced equivalent of "any new endpoint must register an isolation test to pass
    review" for a framework with no decorator-based route metadata.
  - Self-reviewed the diff via an independent subagent before merging. It confirmed the 404/403 split
    is correct and complete (all three route call sites invoke `requireOrgPermission` before any body
    parsing, so non-enumeration holds end-to-end) and that `isolation.test.ts`'s assertions are not
    vacuous (walked the projects-route scenario concretely: org B is a genuinely-created org via
    `createOrganizationWithOwner` for a different owner, so the caller has zero membership row for it,
    and both branches hit the same 404 code path before any other check could short-circuit).
    Two things flagged, both deliberately left as documented follow-ups rather than fixed now:
    - `apps/web/app/[locale]/orgs/[orgId]/projects/new/page.tsx` still folds "no membership" and
      "member without `project.manage`" into one `notFound()` — stricter than the API's new split, and
      now inconsistent with it (an active member lacking the permission gets a page 404 but a route
      403). Not a regression (the file wasn't touched by this story) and not a security problem (folding
      to 404 is the *safer* direction), just an inconsistency worth a small follow-up to align the page
      with the route behavior.
    - `apps/api/src/authz/permission.guard.ts` still returns a single 403 for both "no binding at all"
      and "binding exists, wrong permission" — the same enumeration pattern this story just fixed on the
      web side. Not fixed here because apps/api has no org-scoped routes yet at all (KAN-24 left
      `request.principal` unpopulated; only the health check exists), so there is nothing to enumerate
      today — fixing it now would mean guessing at a shape for routes that don't exist. Flagged for
      whoever builds apps/api's first real org-scoped endpoint to carry the same 404-vs-403 split
      forward from day one.
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green (116 tests in `apps/web`,
    including the new isolation/guard suites and a full Playwright e2e run; one pre-existing,
    previously-documented Playwright flake in `auth.spec.ts` passed on its automatic retry, unrelated to
    this change).
  - Branch `kan-26-hard-isolation`, **PR #11 opened against `main`, NOT YET MERGED** — see stopping
    point below. This is a correction of this same entry's earlier draft, written before CI's actual
    outcome was known; do not trust a "merged" claim from an entry until the PR's actual state is
    re-checked on GitHub.
- **In progress (exact stopping point):** the code itself is complete, self-reviewed (see above), and
  fully green locally (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, using the exact same
  Firestore/Auth emulator + Playwright suite CI runs) — nothing left to implement or fix in the diff.
  What's unfinished is **getting PR #11 merged**: GitHub Actions CI on this sandbox's repo stalled on
  the `Test` step (the `firebase emulators:exec ... "vitest run && playwright test"` step) three
  separate times in a row, each roughly 25-30 minutes after that step started, with no error — just an
  `in_progress` status that never resolved until manually cancelled. Cancelled and re-ran twice
  (`cancel_workflow_run` + `rerun_workflow_run` on run id `28745705492`); the third attempt hit the same
  wall. This does not look like a real test failure (the identical suite runs and passes in well under
  a minute locally in this same sandbox every time it was tried) and the stall wasn't even consistently
  on the same step across attempts (attempt 3 also briefly appeared stuck on "Install Playwright
  browsers" before that step actually completed normally on its own) — most likely sandbox
  CI-runner/status-API flakiness rather than a problem with this PR's code. Sent the repo owner a push
  notification asking whether to merge PR #11 without a passing CI check, or whether they want to
  look into the CI environment themselves, and stopped there rather than retrying indefinitely or
  merging around the CLAUDE.md "CI must be green before merge" rule unilaterally.
- **Blocked + why:** waiting on a human decision (see "Waiting on human" below) for whether to merge PR
  #11 without a green CI check, given three straight CI stalls that don't look like a real test
  failure. Not blocked on any further code work — re-running the *same* passing local suite a fourth
  time isn't expected to reveal anything new.
- **Next step:** **before picking a new task**, check PR #11's actual state on GitHub (open? CI status?
  merged?). If the human has merged it or greenlit merging without CI, TASKS.md's KAN-26 row (already
  marked `done` above, describing the intended end state) is accurate and the next run can proceed
  straight to **KAN-27** (Org Resource Library) or **KAN-30** (keys admin UI) — both unblocked sprint-2
  `todo`s that build on KAN-25/26's real membership/isolation layer. If PR #11 is still open/unmerged
  and un-actioned, that's this story's actual unfinished state despite the `done` status above (mark it
  back to `in-progress` in TASKS.md if so) — re-check CI once before assuming it's still stuck (transient
  sandbox flakiness may have cleared on its own), and if still stalled, it's a human call, not something
  to keep retrying. Two small, non-blocking follow-ups documented above if anyone wants a quick pick-up
  once KAN-26 itself is settled: aligning `projects/new/page.tsx`'s notFound() granularity with the
  API's 404/403 split, and carrying the same split into `apps/api`'s `PermissionGuard` once it has a
  real org-scoped route. The `ensureUserForFirebaseSession` email-verification identity-merge gap
  documented in the KAN-25 entry below is also still open and unrelated to this story.
- **Waiting on human:**
  - **PR #11 (KAN-26)**: decide whether to merge without a passing CI check (the code is locally green
    and self-reviewed; CI stalled on the Test step 3/3 attempts, most likely sandbox infra flakiness —
    see above) or investigate the CI environment first.
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding, unchanged
    by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-26-hard-isolation` branch on GitHub if the sandbox's remote 403
    prevented it (see above), and the other still-outstanding merged branches from prior runs noted in
    earlier entries below.

---

## 2026-07-05 — E1.5 Org-scoped sessions, switchers, invite/join (KAN-25)

- **Last completed:**
  - Found **KAN-25** already fully implemented, self-reviewed (twice), tested, and CI-green on an
    open but unmerged PR (#10, branch `kan-25-org-scoped-sessions`) from an earlier run this same
    day — it had stopped short of merging. This run picked up from there: verified everything
    locally (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, all green, including the
    Firestore/Auth-emulator and Playwright suites), then ran an independent review round on top of
    the PR's own two self-review rounds before merging.
  - **Independent review round** (8 parallel finder angles — line-by-line, removed-behavior,
    cross-file, reuse, simplification, efficiency, altitude, CLAUDE.md conventions — each verified
    against the actual code, not taken at face value):
    - **Fixed, real bug:** `acceptInvite` (`packages/firebase-orm-models/src/services/invite.service.ts`)
      checked invite status (already-accepted) *before* verifying caller identity, so a stranger
      who merely knew a membership id could learn whether an invite was already resolved (409) vs.
      just getting a generic "wrong account" (403). Reordered so identity is always checked first.
    - **Fixed, real gap:** two new client components (`create-project-form.tsx`,
      `switch-account-button.tsx`) shipped with no unit test, unlike every sibling form/button
      component in the same PR — added both, matching the existing pattern.
    - **Fixed, real gap:** the whole project-creation/switching feature area (project switcher, env
      badge, the projects/new page) had zero test coverage of any kind — org creation/switching and
      invite/accept got thorough Playwright e2e coverage in the same PR, but project switching got
      none. Added an e2e scenario covering create-project → project switcher pill → env badge
      dev/staging/prod switching.
    - **Fixed, drift-prevention:** `INVITABLE_ROLES` (`packages/shared/src/policy/roles.ts`) is a
      hand-typed literal array with no test pinning it against `ROLE_SCOPE_LEVELS` — the exact
      relationship its own doc comment describes as the rule. Added a table-driven regression test
      so a future role addition can't silently reintroduce the same over-scoped-invite bug the PR's
      own round-1 review already caught once for `project_admin`.
    - **Attempted and reverted a bad fix:** one finder flagged `firestore-connection.ts`'s
      module-level `connected` boolean as unsafe under Next.js dev-server Fast Refresh (HMR) and
      recommended moving it to `globalThis`. That "fix" actually broke org creation/all org pages
      outright — Next dev mode compiles each route as a separate webpack bundle with its own
      isolated module instance of `@arbel/firebase-orm`'s `FirestoreOrmRepository`, so a
      `globalThis`-shared flag let one bundle's successful connection silently skip *every other
      bundle's* own real connection setup, throwing "The global Firestore default is undefined!"
      the moment two different routes were hit in the same run. Caught this before pushing by
      running the actual e2e suite (all 4 org tests failed identically); reverted the change back
      to the original module-level `let` (confirmed zero diff against the PR's pre-review version)
      and moved on. Documents why speculative "safety" fixes for dev-mode-only theoretical issues
      need to be verified against a real test run, not just reasoned about — this repo's own
      multi-bundle-per-route Next dev behavior is exactly the kind of thing that breaks
      module-scoped-singleton assumptions in a non-obvious way.
    - **Documented, not fixed (deferred as a real but riskier residual gap):** `ensureUserForFirebaseSession`
      (`packages/firebase-orm-models/src/services/user.service.ts`) links/overwrites an existing
      placeholder `UserModel` row's `firebaseUid`/`display_name`/`photo_url` purely by email match,
      with no email-verification check — the verification gate this PR added only guards
      `acceptInvite`'s actual grant, not the identity-merge step itself, which runs on nearly every
      authenticated request via `resolveOrgSessionContext`. Net effect: an attacker who signs up
      with a target's email before the target does gets merged into that email's invite-placeholder
      identity the moment they load any org page (they still can't accept the invite — that gate
      holds — but they can see the placeholder's pending invites and plant `display_name`/`photo_url`
      that the real invitee later inherits). A correct fix means gating the identity-merge itself on
      `emailVerified`, which has a real risk of orphaning the normal first-sign-in-after-invite flow
      if done carelessly (several existing tests/e2e scenarios depend on today's linking behavior);
      left as follow-up rather than rushed. Also deferred as lower-priority/lower-risk: three route
      handlers calling the full `resolveOrgSessionContext` (with its O(orgCount) parallel reads) just
      to read `user.id`, when `ensureUserForFirebaseSession` alone would do; a handful of duplicated
      query-construction snippets and near-identical form-component boilerplate across the new
      `apps/web/components/orgs/*` files.
  - Re-ran `pnpm lint && pnpm typecheck && pnpm test && pnpm build` after all review fixes — green
    (139 tests in `packages/shared`, 21 in `packages/firebase-orm-models`, 107 web unit/route tests +
    10/10 Playwright e2e in `apps/web`, 15 in `apps/api`).
  - Pushed the review-fix commit to `kan-25-org-scoped-sessions`, waited for GitHub Actions CI to go
    green on it, then merged PR #10 (squash) into `main`. Remote branch deletion failed with the
    same HTTP 403 from this sandbox's git remote recorded in every prior run's entry (not a GitHub
    permissions issue) — merged and dead but not deleted.
- **In progress (exact stopping point):** none — KAN-25 is fully delivered, reviewed, tested, and
  merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** **KAN-26** (hard-isolation & non-enumeration layer — 404-not-403, binding-filtered
  lists, scoped caches/search/notifications) is the natural next sprint-2 story now that KAN-25
  supplies a real per-org membership/binding source to test isolation against. **KAN-27** (Org
  Resource Library) and **KAN-30** (keys admin UI) are also now unblocked in principle but KAN-26 is
  the more natural next pick given it hardens what KAN-25 just built. If picking up KAN-26, note the
  `ensureUserForFirebaseSession` email-verification gap documented above as a related, not-yet-fixed
  identity-trust issue worth revisiting in the same area.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding,
    unchanged by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-25-org-scoped-sessions` branch on GitHub (this sandbox's git
    remote rejected the delete with a 403), and the other still-outstanding merged branches from
    prior runs noted in earlier entries below.

---

## 2026-07-05 — E1.1 Firebase Auth + session handling (KAN-21)

- **Last completed:**
  - Implemented **KAN-21** (Firebase Auth: email + Google SSO + session handling in Next.js) in
    `apps/web`:
    - `lib/firebase/client.ts` (lazy client Auth singleton, `client-only`-guarded, connects to the
      Auth emulator via `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`) and `lib/firebase/admin.ts`
      (lazy `firebase-admin` Auth singleton, `server-only`-guarded, falls back to unauthenticated
      emulator-only mode when no service-account env vars are set — production creds are pending
      KAN-18).
    - `lib/auth/auth-context.tsx`: `AuthProvider`/`useAuth` — email/password sign-up/sign-in,
      Google SSO (`signInWithPopup`), sign-out; syncs an httpOnly session cookie via
      `app/api/auth/session/route.ts` (POST verifies the ID token + mints a session cookie via
      `firebase-admin`'s `createSessionCookie`; DELETE clears it). Rolls the client back to
      signed-out if the session-cookie POST fails, so Firebase client state and the server cookie
      can't diverge.
    - `middleware.ts`: fail-closed route gating (mirrors KAN-24's `PermissionGuard` philosophy) —
      checks only the session cookie's *presence* (Edge runtime can't run the Admin SDK), composed
      with next-intl's locale middleware. Real cryptographic verification
      (`verifySessionCookie`) happens per-request in `lib/auth/get-server-session.ts`, called from
      `/dashboard`, `/login`, and `/signup` — the middleware/page split is the deliberate "fast
      presence pre-filter + real verification at the render/data boundary" pattern, documented in
      both files.
    - `/login`, `/signup`, `/dashboard` pages + shared `EmailPasswordForm`; `AppProviders` wires the
      authenticated principal (`{type: 'user', id: firebaseUid}`) into the existing KAN-24
      `PermissionProvider` in the root layout (bindings still `[]` — no role-binding lookup wired
      into the web app yet, pending KAN-22/26 integration; deny-by-default holds).
    - All new strings via `next-intl` (`Auth`/`AccountStatus`/`DashboardPage` namespaces, en+he).
    - Emulator-backed tests mirroring the KAN-22 pattern: `apps/web/firebase.json` adds the Auth
      emulator; `pnpm test` wraps `vitest run && playwright test` in
      `firebase emulators:exec --only auth`. 55 vitest tests (incl. the session route against a
      *real* minted ID token from the emulator's REST API) + a 6-scenario Playwright E2E suite
      driving a real `next dev` server + real Chromium through sign-up → dashboard → sign-out,
      sign-in, wrong-password error, and two regression cases (below).
  - **Self-reviewed via two independent subagent passes** (correctness; reuse/quality) before
    opening the PR. Quality pass found nothing worth changing. Correctness pass found and all now
    fixed:
    - A **real lockout bug**, caught by the review process's own added tests: middleware originally
      redirected away from `/login`/`/signup` whenever a session cookie was merely *present*
      (couldn't verify it — Edge runtime). A forged or stale cookie would satisfy that check and
      permanently bounce a visitor away from the only page that could get them a real session, with
      no way back in. Fixed by moving "redirect away if already authenticated" out of middleware
      entirely and into `login`/`signup` pages' own `getServerSession()` check (real, verified);
      middleware now only ever gates *into* protected routes, never *away from* login/signup.
      Regression-tested at both the middleware-unit level and via a real Playwright scenario
      (forged cookie → stays on `/login`; genuinely authenticated visit to `/login` → redirected to
      `/dashboard`).
    - `/dashboard` had no real server-side session verification at all — only middleware's
      presence check. Added `lib/auth/get-server-session.ts` (`verifySessionCookie`) and wired it
      into the page; verified against a real `next build && next start` that a forged cookie is now
      rejected.
    - Sign-up/in succeeding in Firebase but the session-cookie POST failing left the client in a
      half-signed-in state (Firebase said authenticated, server had no cookie) — now rolls back via
      `firebaseSignOut` on that failure path.
    - A failed session-cookie DELETE on sign-out was silently swallowed — now throws, matching the
      POST branch's error handling.
    - The session route folded a bad ID token and a server-side cookie-minting failure into the
      same 401 — split into 401 (bad token, caller's fault) vs. 500 (our infra).
    - The middleware's `?from=` redirect param was dead code (always redirected to `/dashboard`
      regardless) — wired up via `resolveRedirectTarget()` with an explicit open-redirect guard
      (rejects protocol-relative/absolute targets).
    - `lib/firebase/client.ts` had no `client-only` guard (unlike `admin.ts`'s `server-only`) —
      added, to fail the build if it's ever imported into server code (its module-scope singletons
      would otherwise leak across unrelated requests in a warm server instance).
  - **CI also broke once, independent of the above**: `apps/web`'s Auth emulator and
    `packages/firebase-orm-models`' Firestore emulator each run via a separate
    `firebase emulators:exec`, and turbo runs independent packages' `test` tasks in parallel.
    Neither `firebase.json` pinned the `hub`/`logging` emulator ports, so both defaulted to
    4400/4500 and collided when both suites started at once in CI — passed locally by timing luck,
    failed in CI's first run. Fixed by pinning `apps/web`'s hub/logging to distinct ports
    (4460/4560); reran the full suite with a cleared turbo cache locally to confirm before pushing
    again.
  - `.github/workflows/ci.yml`: added an "Install Playwright browsers" step
    (`playwright install --with-deps chromium`) before the test step.
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green locally and in CI.
  - Branch `kan-21-firebase-auth`, PR #9, merged into `main` (squash). Remote branch deletion
    failed with an HTTP 403 from this sandbox's git remote (same known proxy/remote restriction as
    prior runs, not a GitHub permissions issue) — merged and dead but not deleted.
- **In progress (exact stopping point):** none — KAN-21 is fully delivered, tested, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** **KAN-25** (E1.5 — org-scoped sessions, org switcher, project switcher, env badge,
  create/invite/join flows) depends on KAN-21 and is now unblocked — natural next sprint-1 `todo`.
  It will need a real principal → membership/role-binding lookup, which doesn't exist yet in
  `apps/web` (KAN-21 deliberately left `bindings: []`); building that lookup (likely via
  `@growthos/firebase-orm-models`'s `Membership`/`RoleBinding` models, already CRUD-tested per
  KAN-22) is probably the first sub-step of KAN-25 itself. **KAN-26** (hard-isolation layer) and
  **KAN-30** (keys admin UI) remain natural follow-ons once there's a real binding-lookup source.
  Note for whoever picks up apps/api next: `request.principal` there is still unpopulated — KAN-21
  only covered the Next.js side per its AC; verifying the Firebase session server-to-server for
  apps/api is separate follow-on work, not automatically covered by this story.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding,
    unchanged by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding; also gates
    real (non-emulator) Firebase Auth credentials for KAN-21's production path.
  - Optional: delete the merged `kan-21-firebase-auth` branch on GitHub (this sandbox's git remote
    rejected the delete with a 403), and the still-outstanding `kan-22-firestore-emulator-tests`
    branch from the previous run.

---

## 2026-07-05 — E1.2 Firestore-emulator CRUD/cascade tests (KAN-22)

- **Last completed:**
  - Implemented **KAN-22**'s missing AC on top of the identity/RBAC models scaffolded in the
    KAN-79 bootstrap run (`packages/firebase-orm-models/src/models/`): "CRUD via
    Firestore-emulator tests; one user active in 2 orgs with different roles; removing a
    membership cascades all of that user's bindings in the org."
  - **A real local Firestore emulator is now available in-run** (Java 21 + `firebase-tools` both
    work headlessly here — earlier runs had recorded this as unavailable, which is now stale).
    Wired it into this package's own `pnpm test`: `firebase.json` + `firestore.rules` (open rules,
    since the project id is always the `demo-growthos-test` emulator-only project, never deployed)
    + `firebase`/`firebase-tools` devDependencies; `firebase emulators:exec` starts the emulator,
    runs vitest against it, and tears it down every `pnpm test`.
  - `src/test-utils/emulator.ts`: `connectToFirestoreEmulator()` wires the ORM's global connection
    to the emulator, with a retrying warm-up read before tests run (see flake note below).
  - `src/services/membership.service.ts`: `removeMembershipCascade(membership)` — deletes every
    `RoleBindingModel` doc for that user within the org (across all scope levels, since they share
    one `organizations/{org}/role_bindings` subcollection), then the membership itself. Documented
    as safe-to-retry rather than transactional (the ORM's client-SDK API has no batch/transaction
    primitive; a partial failure leaves the membership in place since it's deleted last, and
    re-calling re-reads current state so it can't double-delete or orphan anything).
  - `src/models.emulator.test.ts` (4 tests against the real emulator): full create/read/update/
    delete lifecycle across Organization, Project, Environment, and ServiceAccount; one user active
    in two orgs with different roles; explicit create/update/delete for Membership and RoleBinding
    directly; the cascade scenario (org- and project-scoped bindings removed on membership removal,
    while another user's binding in the same org survives).
  - **Known flake, mitigated, not root-caused:** the Firestore Node client SDK's "full" (non-lite)
    build opens a persistent gRPC watch stream even for one-shot reads/writes against the local
    emulator, and that stream intermittently corrupts (`RESOURCE_EXHAUSTED: Received message larger
    than max`) — reproduced repeatedly both in this sandbox and in real GitHub Actions runs,
    independent of this repo's code. Investigated and ruled out: proxy env vars (unset didn't fix
    it on a real CI runner with no proxy at all); `NODE_OPTIONS=--conditions=react-native` (Node's
    `node` export condition always wins over `react-native` since it's declared first and can't be
    excluded); aliasing `firebase/firestore` to the REST-only `lite` build (this *did* eliminate the
    flake, but silently broke read-back correctness — `@arbel/firebase-orm`'s internal import only
    picks up the alias when the package is forced through vite's SSR pipeline via
    `test.server.deps.inline`, and even then the ORM's assumptions about the Firestore instance
    shape aren't fully lite-compatible; too risky for a foundational data-access package). Landed on
    three defensive layers instead: a connection warm-up retry, generous `testTimeout`/`hookTimeout`
    (30s), and vitest's built-in `retry: 3`. Empirically this got local stress-test runs to
    ~93-100% pass rate (occasional single-test flakes still happen, costing time via the SDK's own
    backoff, but haven't yet exhausted all retries in CI). The PR's own CI run passed clean on the
    second attempt after also fixing a real, unrelated bug (below).
  - **Real bug fixed along the way:** GitHub Actions' `ubuntu-latest` runner's default `java` on
    `PATH` is older than 21, and `firebase-tools`' emulator now hard-requires Java 21+. Added a
    `Setup Java` step (`actions/setup-java@v4`, Temurin 21) to `.github/workflows/ci.yml` before
    `pnpm install` — this was a genuine CI gap, not related to the flake above.
  - Self-reviewed the diff via an independent subagent before merging; it confirmed the cascade
    logic is scope-safe (verified against the ORM's own `getPathList`/query source) and flagged two
    real, now-fixed gaps: the CRUD test only exercised full lifecycle on `ProjectModel` (Organization/
    Environment/ServiceAccount were create+read only, and Membership/RoleBinding had no direct CRUD
    test outside the cascade scenario) — broadened to full CRUD on every model plus a dedicated
    Membership/RoleBinding test; and the cascade function's non-atomicity wasn't documented — added
    the retry-safety rationale above.
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green locally and in CI (8 tests in
    `packages/firebase-orm-models`, all other packages unchanged).
  - Branch `kan-22-firestore-emulator-tests`, PR #8, merged into `main` (squash). Remote branch
    deletion failed with an HTTP 403 from this sandbox's git remote (same known proxy/remote
    restriction recorded in the 2026-07-04 KAN-24 entry, not a GitHub permissions issue) — merged
    and dead but not deleted; a human with direct repo access can delete it, or a future run can
    retry.
- **In progress (exact stopping point):** none — KAN-22 is fully delivered, tested, and merged.
- **Blocked + why:** nothing blocking the next code task.
- **Next step:** with the Firestore emulator confirmed available, **KAN-21** (Firebase Auth:
  email + Google SSO + session handling in Next.js) is now the natural next sprint-1 `todo` — the
  Firebase Auth emulator should also be reachable the same way (same `firebase-tools`, same Java),
  and Google SSO can be exercised against the Auth emulator's fake-IDP flow without needing real
  Google OAuth credentials. **KAN-25** (org-scoped sessions/switcher UI) depends on KAN-21. If a
  future run hits the gRPC/emulator flake described above again and it's gotten worse (not better),
  worth revisiting: pinning an older Firestore emulator JAR version, or investigating whether a
  newer `firebase` SDK major version (12.x, vs. the `^11.0.0` peer range `@arbel/firebase-orm`
  currently declares) has resolved it upstream — neither was attempted this run given the risk/
  effort tradeoff.
- **Waiting on human:**
  - Decide which KAN-20 PR to keep (#2, #3, or #5) and close the others — still outstanding,
    unchanged by this run.
  - **KAN-43** — submit Google Ads dev token + Meta Marketing API applications (LONG LEAD) — still
    outstanding.
  - **KAN-18** — create GCP/Firebase projects + billing + secrets — still outstanding.
  - Optional: delete the merged `kan-22-firestore-emulator-tests` branch on GitHub (this sandbox's
    git remote rejected the delete with a 403), and the still-outstanding `kan-24-authz-middleware`
    branch from the previous run.

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
