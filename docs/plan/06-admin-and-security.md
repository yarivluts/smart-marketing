# 06 — Admin Console, Security, Privacy & Governance

A dedicated **admin section** is a first-class part of the product (house rule: every new system ships with a management/admin section). Admin exists at **every level of the hierarchy** (see `08 §1/§5`): **platform admin** (GrowthOS operators) → **org admin** (customer's organization: billing, members, SSO, projects) → **project admin** (one product/brand/client: sources, keys, schemas, plugins, automations).

## 1. Org & project admin console

The self-service control center each customer gets. Org-level areas: billing, **member directory (memberships of global users — a user may belong to multiple orgs, `08 §1.1`)**, SSO/SCIM, org policies, project creation, **Org Resource Library** (shared credentials with per-project ad-account slicing, templates, people registry, plugin licenses — attach/detach with approval, `08 §1.2`), cross-project dashboards. Per-project areas:

| Area | Capabilities |
|---|---|
| **Data sources (push)** | Manage **API keys & inbound webhooks** per environment: create/scope/rotate/revoke keys, view ingest health, schema-validation failures, quarantine & dead-letter **replay**. |
| **Schema registry** | Browse/edit registered entity/event/measure schemas, versions, PII flags, identity keys; approve auto-evolution suggestions. |
| **Plugins** | Install/configure/disable plugins (sources, metric packs, actions, AI tools) from the registry; review requested scopes; private org plugins. |
| **Connectors (pull)** | Connect/disconnect platforms, view sync health (last sync, freshness, error rate, rows), re-auth expiring tokens, trigger backfills, map fields. |
| **Conversion mapping** | Map canonical events → each ad platform's conversion actions + values + dedup keys; view match rates. |
| **Metrics & semantic layer** | Browse/define metrics (with AI authoring), edit definitions, version history, run validation. |
| **Funnels & verticals** | Configure funnel steps, monetization step, switch/extend vertical template. |
| **Dashboards & war-room** | Build/edit dashboards, configure goals, war-room "win" rules, TV mode, celebrations. |
| **Automation & guardrails** | Define budget/bid policies, protected campaigns, spend ceilings, autopilot bounds, approval routing. |
| **Alerts** | Anomaly thresholds, digest schedules, routing per channel/owner, Slack/Teams/email/push. |
| **Users & roles** | Invite users, assign roles (RBAC), SSO/SCIM config, review access. |
| **Billing** | Plan, usage (connectors, rows, AI tokens), invoices. |
| **Audit log** | Every config change, automation action, data export — who/what/when/before/after. |
| **Data controls** | Data-retention settings, PII handling, export/delete (GDPR), consent-mode config. |

## 2. Platform (operator) admin

- **Tenant management**: provision/suspend tenants, per-tenant feature flags, quotas, plan overrides, impersonation (audited, consent-gated) for support.
- **Connector registry**: enable/disable platforms globally, manage API app credentials & scopes, monitor cross-tenant connector health and rate-limit budgets.
- **AI governance**: model routing config, per-tenant token budgets/caps, prompt/version management, evaluation-suite results, cost dashboards.
- **Content/config management**: vertical templates, KPI packs, default dashboards, benchmark datasets — managed as content (config over code).
- **System health**: ingestion lag, job failures, queue depth, warehouse cost, error budgets/SLOs.
- **Compliance ops**: DSAR handling, data-deletion pipelines, sub-processor list, incident tooling.

> Implementation note: tenant/app/config/goal/user records live in **Firestore accessed exclusively through `arbel/firebase-orm`** (house rule — all Firestore reads/writes go through firebase-orm models, never the raw SDK). Analytical data stays in the warehouse. Admin actions are transactional and audited.

## 3. Authn / authz

- **Auth**: email + SSO (Google, Microsoft, Okta/SAML, OIDC), SCIM for enterprise provisioning, MFA, session management.
- **Principals**: humans, **service accounts** (plugins/machines), and **API keys** — all evaluated by one deny-by-default policy engine against the org → project → env → object hierarchy. Full model and role/permission catalog in `08 §5`.
- **RBAC**: role bindings grantable at any level (platform / org / project / object) and inherited downward — `Org Owner/Admin`, `Project Admin`, `Editor/Analyst`, `Operator` (automation approval), `Viewer`, `Ingest-only`, plus enterprise custom roles composed from granular scopes (view/edit metrics, manage sources/keys, approve/execute automations, manage billing, export data, read PII).
- **Row/column security**: warehouse row-level `tenant_id` isolation; optional metric-level restriction (e.g., hide revenue from Viewer role).
- Automation execution rights are a **separate, elevated scope** — approving money-moving actions requires explicit permission and (optionally) two-person review.

## 4. Multi-tenant isolation

- `tenant_id` on every operational record and warehouse row; enforced at the query layer, not just the app layer.
- Isolation tiers (per `01`): shared-with-RLS → per-tenant dataset → per-tenant project / BYO-warehouse for enterprise.
- **Credential vault**: OAuth tokens & API keys encrypted with per-tenant KMS envelope keys; no cross-tenant code path; secrets never logged.
- Noisy-neighbor protection: per-tenant rate limits, query cost budgets, and job quotas.

## 5. Privacy & compliance

- **First-party, consent-aware**: capture consent state at the edge; suppress PII when consent absent; support Google **Consent Mode** and modeled conversions.
- **PII minimization**: hash identifiers (email/phone) for conversion upload; keep raw PII in the warehouse, encrypted, access-scoped; **never send raw PII to LLMs** (AI receives aggregated metrics + schema only).
- **Regulations**: GDPR, CCPA/CPRA, and platform data-use policies (Google Ads API, Meta Platform Terms). DPA + sub-processor transparency. Data residency options (EU/US) for enterprise.
- **DSAR & deletion**: self-serve export/delete pipelines that cascade to warehouse + backups.
- **Retention**: configurable per tenant; automatic purge of raw event-level data past window while keeping aggregates.

## 6. Security posture

- Encryption in transit (TLS) and at rest (KMS); field-level encryption for tokens/PII.
- Secrets in a managed vault (GCP Secret Manager); short-lived credentials; automatic token refresh + rotation.
- Least-privilege service accounts per connector; scoped OAuth (read-only unless write-back explicitly enabled).
- **Audit everything** that changes data, config, spend, or access — immutable, exportable log.
- App-sec: dependency scanning, SAST/DAST, secret scanning in CI, pen-tests before GA, bug-bounty post-GA.
- Compliance roadmap: **SOC 2 Type II** (target before enterprise GA), then ISO 27001; GDPR/CCPA readiness from day one.

## 7. Reliability & governance of automation (money-moving safety)

Because GrowthOS can spend real ad budget, automation gets extra governance:

- **Dry-run first**: every agent plan shows a before/after diff and expected impact.
- **Guardrails**: max % budget change/day, absolute spend ceilings, protected/frozen campaigns, allowed hours, per-action blast-radius limits.
- **Approval workflow**: human approval by default (Slack/app); autopilot only within tight, per-tenant bounds.
- **Kill switch**: global + per-tenant "pause all automation" button.
- **Auto-rollback**: if a guarded metric worsens past threshold after an action, revert and alert.
- **Full audit**: every proposed/approved/executed action logged with rationale, actor (human or agent), and outcome.

## 8. Testing & quality (house rule: tests + verification on every change)

- Unit + integration tests per connector (recorded API fixtures), semantic-layer compilation tests, and dbt data tests.
- **AI evaluation harness**: golden NL→metric-query set per vertical; regression-gated on prompt/model changes; hallucination checks (numbers must match Metrics API).
- Contract tests for the Metrics API; end-to-end tests for onboarding → dashboard → insight → action.
- Load/soak tests for ingestion at tenant scale; chaos tests for connector outages (must degrade gracefully, not blank the board).
- Every code change ships with tests and is verified before merge.
