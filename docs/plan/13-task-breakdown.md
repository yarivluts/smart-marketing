# 13 — Concrete Task Breakdown (Phase 0 + Phase 1)

Executable backlog for the first ~13 weeks. Task IDs are stable (`E<epic>.<n>`). Estimates in ideal dev-days (d). Team assumed: 2 FE, 3 BE/data, 1 AI/ML (joins Phase 2), 1 DevOps (shared).

**Definition of Done (every task, house rules):**
- Code + **tests** (unit; integration where an external API/DB is touched) — verified green in CI before merge.
- All Firestore access through **`arbel/firebase-orm`** models (never raw SDK).
- No hard-coded UI strings; all text via translation files (**no Hebrew in code files** — translation resources only).
- Anything user-manageable gets its **admin surface** (or an explicit follow-up task in this doc).
- Telemetry (logs/traces/metrics) for every new service path.

---

## PHASE 0 — Generic core (Sprints 1–3, weeks 1–5)

### Epic E0 — Repo, infra & CI *(DevOps, ~8d)*
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E0.1 | Monorepo scaffold (pnpm/turbo): `apps/web` (Next.js App Router+TS+Tailwind+shadcn), `apps/api` (NestJS), `packages/shared` (types, zod schemas), `packages/firebase-orm-models` | `pnpm build && pnpm test` green locally + CI | 2d |
| E0.2 | GCP projects (dev/staging/prod) via Terraform: Firestore, BigQuery, Pub/Sub, Secret Manager, Cloud Run, Redis | `terraform apply` from clean state; envs isolated | 3d |
| E0.3 | CI/CD (GitHub Actions): lint, typecheck, unit+integration tests, preview deploy per PR, auto-deploy staging on main | PR gets preview URL; red tests block merge | 2d |
| E0.4 | Observability baseline: OpenTelemetry in api, structured logs, error tracking (Sentry), uptime checks | A thrown error is visible in Sentry with trace id | 1d |

### Epic E1 — Identity, org/project hierarchy & RBAC *(BE 2 + FE 1, ~14d)* — spec: `08 §1,§5`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E1.1 | Firebase Auth integration (email+Google SSO) + session handling in Next.js | Sign-up/sign-in/sign-out E2E test passes | 2d |
| E1.2 | firebase-orm models: global `User`, `Organization`, `Membership` (**user↔org many-to-many**, per-org roles/status), `Project`, `Environment`, `RoleBinding` (hangs off membership), `ServiceAccount` (+ indexes) — spec `08 §1.1` | CRUD via Firestore-emulator tests; one user active in 2 orgs with different roles; removing a membership cascades all that user's bindings in the org | 4d |
| E1.3 | Policy engine: permission catalog (`project.manage`, `keys.manage`, `ingest:write`…), role bundles (Org Owner/Admin, Project Admin, Editor, Operator, Viewer, Ingest-only), inheritance org→project→env, **deny-by-default** | Table-driven test matrix: (role × permission × level) → allow/deny; unauthorized API call → 403 | 4d |
| E1.4 | `authz` middleware/decorator for all API routes + client-side gate hooks (`usePermission`) | No route reachable without explicit permission annotation (lint rule enforces) | 2d |
| E1.5 | UI: **org-scoped sessions** + org switcher (lists only user's memberships), project switcher, env badge; create-org/create-project flows; per-org invite & join flows | User with 2 org memberships switches contexts; zero artifacts of org B (search/notifications/recents) render in org A's context | 4d |
| E1.7 | **Org Resource Library** (`08 §1.2`): shared connection credentials (attach per project + ad-account slice selection), templates (copy-with-link + version pin), people registry, attach/detach flows with approval + audit | Two projects use one org-level Meta credential, each seeing only its selected ad accounts; detach revokes access immediately | 4d |
| E1.6 | **Hard-isolation & non-enumeration layer** (`08 §5.6`): 404-not-403 semantics, list endpoints filtered by bindings, project-scoped caches/search/notifications, per-project warehouse datasets, invite-to-project flow (zero org visibility) | **Isolation test suite in CI** covering **both boundaries**: project A ↛ project B, and org A ↛ org B for a user with dual memberships — across list/get/search/metrics/export surfaces; new endpoints must register an isolation test (lint-enforced) | 5d |

### Epic E2 — API keys & credential vault *(BE 1, ~7d)* — spec: `08 §5.3`, `12 §1`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E2.1 | Key service: mint per project+env (`gos_live_/gos_test_` prefixes), scope list, hashed storage, last-used tracking | Key auths a request; wrong env/project/scope → 403; revoke is immediate | 3d |
| E2.2 | KMS envelope encryption for OAuth tokens/secrets (vault module) | Secrets unreadable in Firestore dump; rotation test passes | 2d |
| E2.3 | Admin UI: keys page (create w/ scope picker, copy-once, revoke, last-used) | Full lifecycle via UI; audit entries written | 2d |

### Epic E3 — Ingest Gateway *(BE 2, ~16d)* — spec: `08 §3`, `12 §2`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E3.1 | Schema Registry: firebase-orm models `SchemaDef` (entity/event/measure; fields, types, required, PII flags, identity keys), versioning | Register v1 → evolve to v2 → both queryable; breaking change rejected | 3d |
| E3.2 | `POST /v1/ingest/events|entities|measures`: batch validate against registry, idempotency by client id, 202 + `batch_id`, per-record results endpoint | Load test 1k events/s sustained on staging; duplicate `event_id` deduped | 4d |
| E3.3 | Pipeline: accepted records → Pub/Sub → BigQuery raw tables (partitioned by `org/project/env/date`) | Event visible in BQ < 60s after 202 | 3d |
| E3.4 | Quarantine + DLQ + replay API; per-key rate limiting (Redis token bucket, 429+Retry-After) | Invalid records land in quarantine with reason; replay after schema fix succeeds | 3d |
| E3.5 | Admin UI: ingest health (throughput, error rate, freshness), quarantine browser + replay button | Broken batch diagnosable end-to-end from UI | 3d |
| E3.6 | Per-event volume sparklines + **"tracking broke" alerts** (volume anomaly per event, distinct from business anomalies — `14` gap 7) | Dropping an event type to zero fires an alert within an hour | 2d |

### Epic E4 — Warehouse & modeling foundation *(BE/data 1, ~8d)* — spec: `04 §1`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E4.1 | dbt project: staging models over raw ingest, canonical `entities`/`events`/`measures` core tables, dbt tests | `dbt build` green in CI against test dataset | 3d |
| E4.2 | Orchestration (Dagster or Cloud Workflows): scheduled runs per project, freshness metadata written back | Failed run alerts; freshness queryable per table | 3d |
| E4.3 | Cost guardrails: per-project BQ quotas/labels, query cost logging | Cost per project visible on internal dashboard | 2d |

### Epic E5 — Semantic layer + Metrics API skeleton *(BE/data 1 + BE 1, ~10d)* — spec: `04 §2`, `12 §3`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E5.1 | Metric definition format (YAML/Firestore doc): aggregations, formulas (metric refs), dimensions, filters; validation | Invalid definition rejected with a clear error | 3d |
| E5.2 | Compiler: definition + query request → BigQuery SQL (time grain, compare-period, breakdown) | Golden-file SQL tests for 10 representative queries | 4d |
| E5.3 | `POST /v1/metrics/query` + `GET /v1/metrics` catalog + Redis result cache (keyed by def-version+params) | p95 < 1.5s on cached, < 8s cold on 1M-row test set | 3d |

### Epic E6 — Platform hygiene & long-lead items *(mixed, ~5d)*
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E6.1 | **Apply for Google Ads developer token + Meta app & Marketing API review** (`11 §5`) | Applications submitted with required demo assets; tracked weekly | 1d + wait |
| E6.2 | Audit log service (append-only): every config/key/role/schema change | Tamper-evident; visible in admin UI (basic list) | 2d |
| E6.3 | i18n scaffold (next-intl or similar), en+he resource files, RTL layout toggle | Language switch flips layout; zero hard-coded strings (lint rule) | 2d |

**Phase 0 exit demo:** create org with 2 projects → mint ingest key for staging env → `curl` a custom event → see it validated, landed in BQ, and queryable through `/v1/metrics/query` with a hand-defined metric → all actions audited, all screens permission-gated.

---

## PHASE 1 — Ingestion breadth + dashboards + war-room (Sprints 4–7, weeks 6–13)

### Epic E7 — Plugin framework v1 *(BE 2, ~12d)* — spec: `08 §4`, `12 §5`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E7.1 | `plugin.yaml` manifest parser + registry storage + install-per-project flow (scope consent screen) | Install/uninstall/disable lifecycle with tests | 4d |
| E7.2 | Source-plugin runtime: scheduled execution (Cloud Run jobs), scoped short-lived creds, cursor persistence, retry/backoff | A toy source plugin syncs incrementally and survives restart | 5d |
| E7.3 | Admin UI: plugin gallery, config forms (rendered from `config_schema`), per-plugin health | Non-engineer installs and configures a plugin end-to-end | 3d |

### Epic E8 — First source plugins *(BE 2, ~20d)* — spec: `02 §3`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E8.1 | **Stripe** plugin: OAuth/keys, backfill + webhooks (charges, invoices, subscriptions, refunds, failed payments) → commerce schemas (`09 §2`) incl. monthly/yearly → `mrr_normalized` | MRR/collections match Stripe dashboard ±1% on test account | 5d |
| E8.2 | **Google Ads** plugin: OAuth, GAQL daily reports (campaign/adgroup/ad: spend, clicks, impressions, conversions), currency normalization, backfill 13mo | Spend matches Ads UI ±1% for a test account; rate limits respected | 6d |
| E8.3 | **Meta Ads** plugin: OAuth, Insights (campaign/adset/ad), creative metadata pull, backfill | Same ±1% bar vs. Ads Manager | 5d |
| E8.4 | **GA4** plugin (via BigQuery export or Data API): sessions, events, UTM/click-id capture | Sessions per day match GA4 UI within sampling tolerance | 4d |

### Epic E9 — Inbound webhook mapper *(BE 1 + FE 1, ~9d)* — spec: `08 §3.2`, `12 §2.4`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E9.1 | Per-project hook endpoints: store raw payload, signature verification options, review queue | Unknown payloads visible in queue, nothing lost | 3d |
| E9.2 | Mapping engine: saved field-mappings (JSONPath → schema fields), transforms (rename, cast, template), test-run on sample | Shopify `orders/create` sample → `order_completed` event mapped in tests | 3d |
| E9.3 | Mapping UI with **AI-assisted suggestion** (LLM proposes field mapping from sample payload; user confirms) | 3-field mapping done in < 2 min in usability test | 3d |

### Epic E10 — Identity & attribution v1 *(BE/data 1, ~8d)* — spec: `04 §4`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E10.1 | Deterministic identity stitching (dbt): registered identity keys → `bridge_identity`, conflict rules | Synthetic fixtures: anon→signup→purchase stitched correctly | 4d |
| E10.2 | Touchpoint capture: JS snippet/SDK storing UTM/click-ids at entry, attached to ingest events | GCLID present on a test conversion end-to-end | 2d |
| E10.3 | Last-touch + first-touch attribution models over touchpoints; `fact_attribution` | CAC by channel computable; model labeled in API response | 2d |

### Epic E11 — Marketing metric pack + dashboards *(FE 2 + data 1, ~16d)* — spec: `04 §2–3`, `10 §2.2`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E11.1 | SaaS/marketing **metric-pack plugin**: `ad_spend, signups, cost_per_signup, cac, conversion_to_paying, mrr, mrr_movements, net_mrr_churn, troi, collected_revenue, failed_charge_rate` | Installing pack registers all metrics; each has a definition test | 4d |
| E11.2 | Dashboard framework: board model (firebase-orm), grid drag-drop, tile types (line/bar/big-number/table/funnel), metric picker, date range + compare, global filters | Build a board with 6 tiles without code; layout persists | 6d |
| E11.3 | Default boards shipped with the pack: Marketing, Revenue/MRR, Funnel | New project with pack installed shows populated boards after first sync | 2d |
| E11.4 | Cohort engine v1 + heatmap tile (signup-month × conversion/retention) | Cohort matrix matches hand-computed fixture | 4d |
| E11.5 | Engagement pack: `dau/wau/mau`, stickiness ratio, **L28/LN histogram** + histogram tile type (`14` gap 2) | L28 histogram matches fixture on synthetic events | 3d |

### Epic E12 — Goals & war-room *(FE 1 + BE 1, ~10d)* — spec: `04 §6`, `10 §2.3`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E12.1 | Goal model (metric, target, deadline, owner, **direction min/max/range**, **work-week/weekend rhythm** — `14` gap 8) + progress calc + pace projection (linear v1) | Goal thermometer renders with pace status; minimize-goal (signup cost) shows correct red/green | 4d |
| E12.2 | Win rules engine: event pattern → "win" (e.g., `first_charge`, order > X) with realtime path (ingest → Pub/Sub → WebSocket) | Test purchase appears in feed < 5s | 4d |
| E12.3 | War-room TV mode: fullscreen board rotation, win feed overlay, confetti + sound per win type, device pairing code, reduced-motion setting | Runs 24h on a TV browser without leak/crash | 3d |

### Epic E13 — Onboarding & alpha polish *(FE 1 + PM, ~8d)* — spec: `10 §2.6`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E13.1 | Onboarding wizard: org/project → pack pick → connect sources (or "push your own" with copy-paste curl+key) → confirm AI-proposed funnel mapping → starter board | New tenant reaches populated board < 30 min (measured) | 5d |
| E13.2 | Freshness badges + degraded-state UX on every tile; empty states | Killing a connector shows stale badge, not blank board | 2d |
| E13.3 | Alpha feedback instrumentation: product analytics on our own funnel (dogfood via our Ingest API) | Our own GrowthOS project tracks activation of design partners | 1d |

**Phase 1 exit demo (= private alpha):** design partner connects Google+Meta+Stripe+GA4 → CAC/TROI/MRR boards accurate vs. their sources → live war-room celebrates a real payment → one custom system pushes events via key → everything permission-scoped and audited.

---

## Sprint map & critical path

| Sprint (2w) | FE | BE/Data | DevOps |
|---|---|---|---|
| S1 (w1–2) | E1.5 shells, E6.3 i18n | E1.1–E1.3, E0.1 | E0.2–E0.4 |
| S2 (w3–4) | E2.3, E3.5 | E1.4, E2.1–E2.2, E3.1–E3.2 | E6.1 apps, quotas |
| S3 (w5) | admin polish | E3.3–E3.4, E4.1–E4.3, E5.1–E5.3, E6.2 | — |
| S4 (w6–7) | E11.2 start | E7.1–E7.3, E8.1 Stripe | — |
| S5 (w8–9) | E11.2–E11.3 | E8.2 Google, E10.1–E10.3 | — |
| S6 (w10–11) | E11.4, E12.1 | E8.3 Meta, E8.4 GA4, E9.1–E9.2 | — |
| S7 (w12–13) | E12.2–E12.3, E13.1–E13.3 | E9.3, E11.1, hardening | load tests |

**Critical path:** E1 (RBAC) → E2 (keys) → E3 (ingest) → E4/E5 (warehouse+metrics) → E8 (connectors) → E11 (dashboards) → E12 (war-room). E6.1 (Google/Meta API approvals) runs in parallel from week 1 — **it gates E8.2/E8.3**; if approval slips, swap Meta/Google order or extend GA4/Stripe scope.

**Risks to watch per sprint:** S2 — policy-engine scope creep (freeze catalog v1); S4 — plugin runtime over-engineering (two concrete plugins define the abstraction, not the reverse); S6 — connector accuracy (±1% bars are the acceptance tests, budget reconciliation time).

---

## PHASE 3 epics (pre-broken-down — ad write-back + MCP)

### Epic E21 — Manage-tier ad write-back *(BE 2, ~20d)* — spec: `02 §3`, `06 §7`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E21.1 | Automation-service action pipeline: action model, **dry-run diff → approval → execute → verify → rollback**, guardrail policy engine (max % change, ceilings, protected campaigns, hours), kill switch | Simulated budget change blocked by each guardrail type in tests; rollback restores prior state | 5d |
| E21.2 | Google Ads **Manage** plugin: campaign/ad-group/ad create+edit (RSA, PMax asset groups), keywords/negatives, audience attach; **created objects default paused** | E2E on test account: AI-drafted campaign created paused, approved, activated, rolled back | 6d |
| E21.3 | Meta **Manage** plugin: campaign/adset/ad create+edit, creative upload (image/video+copy), **Custom/Lookalike audience creation from GrowthOS segments** (hashed upload) | Segment → Custom Audience E2E on test ad account; match-rate reported | 6d |
| E21.4 | Admin: write-tier selector per connection (Read/Optimize/Manage), guardrail policy editor, action-history UI with before/after | Tier downgrade immediately revokes capabilities; every action browsable with diff | 3d |

### Epic E22 — MCP server *(BE 1, ~11d)* — spec: `12 §6`
| ID | Task | Acceptance criteria | Est |
|---|---|---|---|
| E22.1 | MCP server (Streamable HTTP) at per-project scope; OAuth 2.1 + scoped API keys (`mcp:read`/`mcp:act`); read tools: `list_metrics`, `describe_metric`, `query_metric`, `compare_periods`, `decompose`, funnels/cohorts, `search_customers`, `list_insights` | Claude Desktop connects and answers "what was CAC last week by channel" with correct numbers vs. the web app | 5d |
| E22.2 | Act tools: `propose_action` (returns dry-run diff) / `approve_action` (requires `automation.approve`), `create_goal`, `create_segment` — wired to E21.1 pipeline | Action proposed from Claude chat executes only after approval; guardrails apply identically | 3d |
| E22.3 | MCP surface added to the **isolation test suite** (E1.6) + audit logging (principal + client identity) + rate/token budgets per key | Project-A token cannot list/query anything of project B via MCP; all calls audited | 2d |
| E22.4 | Docs + example clients: Claude Desktop config, claude.ai connector setup, headless-agent recipe | A new user connects in < 10 minutes following the doc | 1d |

**Ordering:** E21.1 precedes E21.2/E21.3 and E22.2. E22.1 can start as soon as the Metrics API (E5) is stable — it can even ship in Phase 2 alongside the AI Analyst, since both consume the same tool layer.
