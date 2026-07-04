# 07 — Roadmap, Delivery Plan & Success Metrics

A phased plan from a thin, useful slice to the full AI-native, multi-vertical platform. Sequence favors **shipping a real war-room for one vertical fast**, then generalizing.

## 1. Phasing principle

> Ship the **narrowest complete loop** first: connect Meta + Google + Stripe → canonical funnel → CAC/TROI/MRR dashboard + real-time win war-room, for the **SaaS vertical**. Everything else (more platforms, verticals, AI depth, automation) layers onto that spine.

## 2. Phases

### Phase 0 — Foundations: the generic core (weeks 1–5)
- Repo, CI/CD, IaC (Terraform), environments; observability baseline.
- **Apply immediately for Google Ads developer token + Meta app review** — approval takes weeks–months and gates Phase 1/3 (see `11 §5`).
- **Org → Project → Environment hierarchy** + deny-by-default RBAC (role bindings, service accounts, scoped API keys — `08 §1/§5`), Firestore (via `arbel/firebase-orm`) + BigQuery datasets partitioned by org/project/env.
- **Ingest Gateway v1**: push API (events/entities/measures), schema registry + validation, quarantine/DLQ + replay (`08 §3`).
- Plugin framework skeleton + credential vault; dbt project skeleton; Metrics API skeleton.
- **Exit:** an org with two projects; each can mint an ingest key and push a custom event end-to-end into its own isolated dataset.

### Phase 1 — Core ingestion + first dashboards (weeks 6–13) → **private alpha**
- **Webhook receiver + UI/AI-assisted payload mapping** (any SaaS → registered events, `08 §3.2`).
- Connectors as **source plugins**: **Google Ads, Meta Ads, Stripe, GA4** (read); SaaS marketing **metric pack** as the first metric-pack plugin.
- Canonical model + dbt for spend/funnel/revenue; identity stitching (deterministic).
- Semantic layer with the core metric pack: `spend, signups, CAC, cost_per_signup, conversion_to_paying, MRR, mrr_movements, churn, TROI (last-touch)`.
- Dashboards: Marketing, MRR/Revenue, Funnel; cohort engine v1.
- **Real-time war-room v1**: live paid/upgrade feed + goals + celebration (the BigBrain soul).
- **Exit:** an internal/design-partner SaaS company replaces its BigBrain-style spreadsheet with GrowthOS.

### Phase 2 — AI Analyst + insights (weeks 13–20) → **private beta**
- **NL AI Analyst** (Claude + tool-calling over Metrics API) with grounded, cited answers.
- **Auto-insights & daily digest** (Slack/email); **anomaly detection** on core metrics.
- **Ops layer** (`14` gaps 5+1): live record feeds + saved segments as work lists; NPS/survey ingestion + AI theme clustering; engagement pack (DAU/MAU, L28 histogram) if not landed in Phase 1.
- Attribution engine v2: multiple rules-based models + platform-vs-modeled comparison.
- Admin console v1 (connectors health, users/RBAC, metrics browser, audit log).
- **Exit:** users ask questions in words and get correct, sourced answers; daily digest drives behavior.

### Phase 3 — Optimization loop + conversion send-back (weeks 21–30) → **GA (SaaS vertical)**
- **Conversions API / Enhanced Conversions / offline import** send-back (Meta CAPI, Google) — closes the performance loop.
- **Forecasting** (MRR/spend pacing/payback) + **budget/bid optimizer** (recommendations).
- **Agentic actions** with guardrails + approval workflow (propose → approve → execute → verify → rollback).
- **Manage-tier ad write-back** (`02 §3`): campaign/adset/ad creation & editing on Google + Meta, creative upload, audience creation from segments — created objects default to paused.
- **MCP server v1** (`12 §6`): read tools + propose/approve, per-project scope, OAuth + scoped keys.
- SOC 2 Type II work begins; billing/plans live.
- **Exit:** GrowthOS measurably improves a customer's CAC/ROAS, not just reports it.

### Phase 4 — Multi-vertical + multi-platform breadth (weeks 31–44)
- Vertical adapters: **E-commerce** (Shopify + ROAS/AOV/LTV), **Lead-gen/B2B** (HubSpot/Salesforce + LinkedIn + offline conversions), **Mobile** (AppsFlyer/Adjust + RevenueCat).
- **Hybrid-store support** (`09`): full product-type model — physical (fulfillment, returns, COGS/contribution margin), digital (delivery/licensing), subscriptions (monthly/yearly, MRR normalization, dunning) — mixed carts, blended LTV/CAC, margin-aware conversion send-back.
- More ad platforms: TikTok, Microsoft/Bing, LinkedIn, X, Reddit.
- **Data-driven attribution** (Markov/Shapley) + **incrementality testing** (geo-holdout).
- AI **metric & dashboard authoring** (non-engineers extend the system).
- **Support/CS analytics** (Zendesk/Intercom + agent leaderboards + people layer), **experimentation integration** (GrowthBook/Optimizely), sales-assist feeds (`14` gaps 6, 3, 9).
- **Exit:** onboarding a non-SaaS business is self-serve via a vertical template.

### Phase 5 — Scale, agencies & network effects (weeks 45–60)
- **Creative intelligence** (vision scoring + generation).
- **Agency/portfolio** view, white-label, embedded dashboards, public Metrics API.
- **Benchmarks** (opt-in, anonymized) data-network.
- Mobile app; autopilot automation (tightly bounded); marketplace vertical.
- Enterprise: BYO-warehouse, data residency, ISO 27001.

## 3. Team (lean → scaling)

| Function | Phase 0–2 | Phase 3–5 |
|---|---|---|
| Product/design | 1 PM + 1 designer | +1 each |
| Frontend (Next.js/TS) | 2 | 3–4 |
| Backend/data (TS + Python) | 3 | 5–6 |
| Data/analytics eng (dbt/semantic) | 1 | 2 |
| ML/AI eng | 1 | 2–3 |
| DevOps/SRE | 1 (shared) | 2 |
| Security/compliance | fractional | 1 |

## 4. Key risks & mitigations

| Risk | Mitigation |
|---|---|
| **Ad-platform API complexity & rate limits** (Google/Meta are the hard part) | Buy mature connectors where possible; build deep only for Google/Meta; robust rate-limit + backfill infra; abstract behind the connector contract. |
| **Attribution is genuinely ambiguous** | Never present one opaque number; show platform-vs-modeled + incrementality; be honest about causality. |
| **AI hallucinating numbers** | Numbers only from Metrics API (tool-calling); citations + reproducible queries; eval harness gating releases. |
| **Automation spending money wrongly** | Dry-run, guardrails, human approval default, kill switch, auto-rollback, full audit. |
| **Privacy/regulatory** | First-party + consent-mode, PII minimization, no PII to LLMs, SOC 2, DPA, residency. |
| **Warehouse cost blow-up** | Incremental models, pre-aggregation, query caching, per-tenant cost budgets & monitoring. |
| **Scope creep across verticals** | Ship SaaS end-to-end first; generalize only after the loop is proven; verticals as config. |
| **Trust vs. incumbents** | Metric lineage + explainability + "config over code" as the wedge; the AI analyst + real-time war-room as the differentiators. |

## 5. Success metrics (how we know it's working)

**Product/engagement**
- Time-to-first-dashboard after signup (< 30 min target).
- Weekly active analysts per tenant; # AI-Analyst questions/week; digest open→action rate.
- % of tenants with a live war-room / goals configured.

**Value delivered**
- Measured CAC/ROAS improvement attributable to GrowthOS recommendations (via holdouts).
- Conversion-send-back match rate & lift in platform optimization.
- Forecast accuracy (MRR/spend) vs. actuals.

**Business**
- Connectors per tenant (breadth of adoption), retention/NRR, expansion to more verticals, agency/portfolio seats.

## 6. Immediate next steps (if greenlit)

1. Pick the design-partner SaaS company (dogfood the war-room) and confirm their stack (Google + Meta + Stripe + GA4).
2. Stand up Phase 0 foundations (tenancy, connector framework, warehouse, semantic-layer skeleton).
3. Build the **thin vertical slice**: Meta+Google+Stripe → CAC/TROI/MRR dashboard + real-time win war-room.
4. Layer the AI Analyst on top of the Metrics API once the core metrics are trustworthy.
5. Add tests + an AI-eval harness alongside each capability from day one (house rule: tests + verification on every change).

---

### See also
- [`00-overview.md`](00-overview.md) · [`01-architecture.md`](01-architecture.md) · [`02-integrations.md`](02-integrations.md) · [`03-ai-capabilities.md`](03-ai-capabilities.md) · [`04-data-model-and-metrics.md`](04-data-model-and-metrics.md) · [`05-multi-vertical.md`](05-multi-vertical.md) · [`06-admin-and-security.md`](06-admin-and-security.md) · [`08-generic-platform.md`](08-generic-platform.md) · [`09-commerce-product-types.md`](09-commerce-product-types.md)
