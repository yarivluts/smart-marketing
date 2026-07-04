# TASKS — GrowthOS backlog (mirror of Jira project KAN)

This mirrors the Jira **KAN** (GrowthOS) backlog. Epics are KAN-1..KAN-16; the buildable stories are
KAN-17..KAN-78, listed below. Keep this file in sync with Jira as work progresses.

**Status legend:** `todo` · `in-progress` · `done` · `needs-human` (a human must act — accounts,
billing, secrets, external approvals) · `blocked-by` (waiting on another story; see Notes).

**How a scheduled run uses this file:** read [PROGRESS.md](./PROGRESS.md) + this file, pick the next
`todo` in sprint order (lowest sprint first), skipping `needs-human` and `blocked-by` items whose
blocker is unfinished. See [CLAUDE.md](./CLAUDE.md) for the full working rules.

## Human-action queue (do these out of band)

- **KAN-43** — apply for Google Ads developer token + Meta app / Marketing API review. LONG LEAD:
  submit in week 1; it gates KAN-50 and KAN-51.
- **KAN-18** — create GCP/Firebase projects (dev/staging/prod), enable billing, provision secrets.
  Gates most infra-dependent stories (ingest pipeline, warehouse, auth against a real project).
- General: any cloud account creation, API secrets, and billing setup.

## Stories

| KAN | Story | Phase | Sprint | Status | Notes |
| --- | ----- | ----- | ------ | ------ | ----- |
| KAN-17 | E0.1 Monorepo scaffold: apps/web (Next.js+TS+Tailwind+shadcn), apps/api (NestJS), packages/shared, packages/firebase-orm-models | 0 | 1 | done | Delivered by this bootstrap (E0.1 monorepo scaffold). |
| KAN-18 | E0.2 GCP projects (dev/staging/prod) via Terraform: Firestore, BigQuery, Pub/Sub, Secret Manager, Cloud Run, Redis | 0 | 1 | needs-human | Requires GCP/Firebase account creation, billing, secrets. |
| KAN-19 | E0.3 CI/CD (GitHub Actions): lint, typecheck, tests, preview deploy per PR, auto-deploy staging | 0 | 1 | in-progress | CI (lint/typecheck/test/build) green via .github/workflows/ci.yml; preview + staging deploy still needs infra. |
| KAN-20 | E0.4 Observability baseline: OpenTelemetry, structured logs, Sentry, uptime checks | 0 | 1 | todo |  |
| KAN-21 | E1.1 Firebase Auth integration (email + Google SSO) + session handling in Next.js | 0 | 1 | todo |  |
| KAN-22 | E1.2 firebase-orm models: global User, Organization, Membership (user-org many-to-many), Project, Environment, RoleBinding, ServiceAccount | 0 | 1 | todo |  |
| KAN-23 | E1.3 Policy engine: permission catalog, role bundles, inheritance org->project->env, deny-by-default | 0 | 1 | done | Delivered in `packages/shared/src/policy` (KAN-79 run 2). 138-case table-driven test matrix (role x permission x level). The "unauthorized API call -> 403" half of the AC has no route to test against yet — apps/api only has a health check; wiring the engine into route guards is KAN-24. |
| KAN-24 | E1.4 authz middleware/decorator for all API routes + client-side permission gate hooks | 0 | 2 | todo |  |
| KAN-25 | E1.5 UI: org-scoped sessions, org switcher (memberships only), project switcher, env badge, create/invite/join flows | 0 | 1 | todo |  |
| KAN-26 | E1.6 Hard-isolation & non-enumeration layer: 404-not-403, binding-filtered lists, scoped caches/search/notifications, per-project datasets | 0 | 2 | todo |  |
| KAN-27 | E1.7 Org Resource Library: shared credentials (attach per project + ad-account slicing), templates, people registry, attach/detach with approval | 0 | 2 | todo |  |
| KAN-28 | E2.1 Key service: mint per project+env (gos_live_/gos_test_), scope list, hashed storage, last-used tracking | 0 | 2 | todo |  |
| KAN-29 | E2.2 KMS envelope encryption for OAuth tokens/secrets (vault module) | 0 | 2 | todo |  |
| KAN-30 | E2.3 Admin UI: keys page (create with scope picker, copy-once, revoke, last-used) | 0 | 2 | todo |  |
| KAN-31 | E3.1 Schema Registry: SchemaDef models (entity/event/measure; fields, types, PII flags, identity keys), versioning | 0 | 2 | todo |  |
| KAN-32 | E3.2 POST /v1/ingest/(events|entities|measures): batch validation, idempotency, 202 + batch_id, per-record results | 0 | 2 | todo |  |
| KAN-33 | E3.3 Pipeline: accepted records -> Pub/Sub -> BigQuery raw tables (partitioned by org/project/env/date) | 0 | 3 | todo |  |
| KAN-34 | E3.4 Quarantine + DLQ + replay API; per-key rate limiting (Redis token bucket, 429 + Retry-After) | 0 | 3 | todo |  |
| KAN-35 | E3.5 Admin UI: ingest health (throughput, error rate, freshness), quarantine browser + replay button | 0 | 2 | todo |  |
| KAN-36 | E3.6 Per-event volume sparklines + tracking-broke alerts (volume anomaly per event) | 1 | - | todo |  |
| KAN-37 | E4.1 dbt project: staging models over raw ingest, canonical entities/events/measures core tables, dbt tests | 0 | 3 | todo |  |
| KAN-38 | E4.2 Orchestration (Dagster/Cloud Workflows): scheduled runs per project, freshness metadata written back | 0 | 3 | todo |  |
| KAN-39 | E4.3 Cost guardrails: per-project BigQuery quotas/labels, query cost logging | 0 | 3 | todo |  |
| KAN-40 | E5.1 Metric definition format (YAML/Firestore): aggregations, formulas, dimensions, filters + validation | 0 | 3 | todo |  |
| KAN-41 | E5.2 Compiler: definition + query request -> BigQuery SQL (time grain, compare-period, breakdown) | 0 | 3 | todo |  |
| KAN-42 | E5.3 POST /v1/metrics/query + GET /v1/metrics catalog + Redis result cache | 0 | 3 | todo |  |
| KAN-43 | E6.1 Apply for Google Ads developer token + Meta app & Marketing API review (LONG LEAD - submit week 1!) | 0 | 1 | needs-human | LONG LEAD - Google Ads dev token + Meta app/Marketing API review must be submitted by a human in week 1. |
| KAN-44 | E6.2 Audit log service (append-only): every config/key/role/schema change | 0 | 3 | todo |  |
| KAN-45 | E6.3 i18n scaffold (next-intl), en+he resource files, RTL layout toggle | 0 | 1 | todo |  |
| KAN-46 | E7.1 plugin.yaml manifest parser + registry storage + install-per-project flow (scope consent) | 1 | 4 | todo |  |
| KAN-47 | E7.2 Source-plugin runtime: scheduled execution, scoped short-lived creds, cursor persistence, retry/backoff | 1 | 4 | todo |  |
| KAN-48 | E7.3 Admin UI: plugin gallery, config forms rendered from config_schema, per-plugin health | 1 | 4 | todo |  |
| KAN-49 | E8.1 Stripe plugin: OAuth/keys, backfill + webhooks (charges, invoices, subscriptions, refunds, failed payments) -> commerce schemas incl. mrr_normalized | 1 | 4 | todo |  |
| KAN-50 | E8.2 Google Ads plugin: OAuth, GAQL daily reports (campaign/adgroup/ad), currency normalization, backfill 13mo | 1 | 5 | blocked-by | blocked-by KAN-43 (needs Google Ads API approval). |
| KAN-51 | E8.3 Meta Ads plugin: OAuth, Insights (campaign/adset/ad), creative metadata pull, backfill | 1 | 6 | blocked-by | blocked-by KAN-43 (needs Meta Marketing API approval). |
| KAN-52 | E8.4 GA4 plugin (BigQuery export or Data API): sessions, events, UTM/click-id capture | 1 | 6 | todo |  |
| KAN-53 | E9.1 Per-project hook endpoints: store raw payload, signature verification, review queue | 1 | 6 | todo |  |
| KAN-54 | E9.2 Mapping engine: saved field-mappings (JSONPath -> schema fields), transforms, test-run on sample | 1 | 6 | todo |  |
| KAN-55 | E9.3 Mapping UI with AI-assisted suggestion (LLM proposes mapping from sample payload; user confirms) | 1 | 7 | todo |  |
| KAN-56 | E10.1 Deterministic identity stitching (dbt): registered identity keys -> bridge_identity, conflict rules | 1 | 5 | todo |  |
| KAN-57 | E10.2 Touchpoint capture: JS snippet/SDK storing UTM/click-ids at entry, attached to ingest events | 1 | 5 | todo |  |
| KAN-58 | E10.3 Last-touch + first-touch attribution models; fact_attribution | 1 | 5 | todo |  |
| KAN-59 | E11.1 SaaS/marketing metric-pack plugin: ad_spend, signups, cost_per_signup, cac, conversion_to_paying, mrr, mrr_movements, net_mrr_churn, troi, collected_revenue, failed_charge_rate | 1 | 7 | todo |  |
| KAN-60 | E11.2 Dashboard framework: board model, grid drag-drop, tile types (line/bar/big-number/table/funnel), metric picker, date range + compare, global filters | 1 | 4 | todo |  |
| KAN-61 | E11.3 Default boards shipped with pack: Marketing, Revenue/MRR, Funnel | 1 | 5 | todo |  |
| KAN-62 | E11.4 Cohort engine v1 + heatmap tile (signup-month x conversion/retention) | 1 | 6 | todo |  |
| KAN-63 | E11.5 Engagement pack: dau/wau/mau, stickiness ratio, L28/LN histogram + histogram tile type | 1 | - | todo |  |
| KAN-64 | E12.1 Goal model (metric, target, deadline, owner, direction min/max/range, work-week/weekend rhythm) + progress + pace projection | 1 | 6 | todo |  |
| KAN-65 | E12.2 Win rules engine: event pattern -> win, realtime path (ingest -> Pub/Sub -> WebSocket) | 1 | 7 | todo |  |
| KAN-66 | E12.2b Win catalog: reactivation + trial-conversion win types; trial-pipeline war-room widget | 1 | - | todo |  |
| KAN-67 | E12.3 War-room TV mode: fullscreen rotation, win feed overlay, confetti + sound per win type, device pairing code, reduced-motion | 1 | 7 | todo |  |
| KAN-68 | E13.1 Onboarding wizard: org/project -> pack pick -> connect sources or push-your-own (curl+key) -> AI-proposed funnel mapping -> starter board | 1 | 7 | todo |  |
| KAN-69 | E13.2 Freshness badges + degraded-state UX on every tile; empty states | 1 | 7 | todo |  |
| KAN-70 | E13.3 Alpha feedback instrumentation: dogfood our own funnel via our Ingest API | 1 | 7 | todo |  |
| KAN-71 | E21.1 Automation-service action pipeline: dry-run diff -> approval -> execute -> verify -> rollback; guardrail policy engine; kill switch | 3 | - | todo |  |
| KAN-72 | E21.2 Google Ads Manage plugin: campaign/ad-group/ad create+edit (RSA/PMax), keywords/negatives, default-paused creation | 3 | - | todo |  |
| KAN-73 | E21.3 Meta Manage plugin: campaign/adset/ad create+edit, creative upload, Custom/Lookalike audience creation from GrowthOS segments | 3 | - | todo |  |
| KAN-74 | E21.4 Admin: write-tier selector per connection (Read/Optimize/Manage), guardrail policy editor, action-history UI with before/after | 3 | - | todo |  |
| KAN-75 | E22.1 MCP server (Streamable HTTP), per-project scope, OAuth 2.1 + scoped keys; read tools: query_metric, compare_periods, decompose, funnels/cohorts, search_customers, list_insights | 3 | - | todo |  |
| KAN-76 | E22.2 Act tools: propose_action (dry-run diff) / approve_action (requires automation.approve), create_goal, create_segment | 3 | - | todo |  |
| KAN-77 | E22.3 MCP surface in isolation test suite + audit logging (principal + client identity) + rate/token budgets per key | 3 | - | todo |  |
| KAN-78 | E22.4 Docs + example clients: Claude Desktop config, claude.ai connector setup, headless-agent recipe | 3 | - | todo |  |
