# GrowthOS — AI-Native Growth & Marketing Intelligence Platform

> Working title: **GrowthOS**. A modern, multi-tenant, AI-native successor to monday.com's internal **BigBrain** growth "war room".

---

## 1. What BigBrain was (the reference system)

The HTML snapshots in this repo are monday.com's (formerly daPulse) internal business-intelligence platform, **BigBrain** (`bigbrain.me`). It is a growth-team command center. Reverse-engineering the navigation and dashboards, it covered:

| Domain | Reports observed |
|---|---|
| **Premium / Paying** | Paying accounts growth, paying users, paying growth behavior, paying distribution, conversion-to-paying (graph + cohort), recent paying |
| **Billing** | Monthly collection, daily collection, coupons, failed charges |
| **Upgrades** | Account upgrades, paying-users cohort, upgrade potential (survey), recent upgrades (+failed) |
| **MRR** | MRR growth, MRR cohort (+graph), net/gross churn, MRR pyramid, new-MRR distribution, MRR growth behavior |
| **Marketing** | Acquisition cohort, **TROI (True ROI)**, signups growth, **campaying** (campaign→paying), **spend distribution**, organic growth, landing-page performance, banners, intent breakdown, **FB CPS** (Facebook cost-per-signup) |
| **Engagement** | Events-count tracking, weekly retention, behavior cohorts, survival comparison |
| **Churn** | Churn analysis, churn cohort, monthly account churn, accounts churn cohort, LTV |
| **Sales** | Pipeline manage, last demos, recent upgrades |
| **Dashboards** | Company goals ("space age" goals screen), Customer Success (agent response times), **KPIs war-room** (real-time payments with fireworks + sound per payment), Marketing main |

**Key characteristics of the original:**
- Internal, single-tenant (one company: monday.com).
- Built ~2016 on Ruby on Rails + AngularJS 1.x + jQuery + Bootstrap 3 + Pusher (real-time) + hand-built SQL reports.
- Metrics were **hard-coded per report**; adding a metric meant an engineer writing a query + a view.
- **Emotional/cultural layer**: celebratory KPI screen (confetti, per-account-manager sounds, company-goal thermometers) — a deliberate motivation tool, not just analytics.
- Marketing spend data (Google/Facebook) was ingested and joined against the funnel to compute true ROI, CAC, and cohort payback.

## 2. What we are building (the vision)

A **multi-tenant SaaS** that any business can connect its ad accounts, product analytics, billing, and CRM to, and get a **self-updating growth war-room** — with an **AI analyst** layered on top that explains *why* numbers moved, *predicts* where they're going, and *acts* (reallocates budget, pauses losing campaigns, flags churn risks).

At its core it is a **generic, multi-project, pluggable metrics platform** (see [`08-generic-platform.md`](08-generic-platform.md)): an organization holds many projects (products, brands, agency clients), each with its own data, permissions, and API keys; **any system can push data in** through an open Ingest API/webhooks/SDKs, and everything — connectors, metric packs, verticals, actions — is a **plugin**. Marketing/growth is the first solution pack installed on that core.

Three pillars:

1. **Connect everything** — pull connectors for ad platforms (Google, Meta, TikTok, LinkedIn, X, Reddit, Microsoft/Bing), analytics (GA4, Segment, PostHog, Amplitude), billing (Stripe, Chargebee, Paddle, Recurly), CRM (HubSpot, Salesforce), warehouses (BigQuery, Snowflake) — **plus an open push Ingest API** so any custom system sends its own data. One canonical funnel model.
2. **Understand automatically** — a semantic metric layer + AI that turns raw joined data into CAC, LTV, ROAS/TROI, payback, MRR movements, cohort retention, and channel attribution **without an engineer writing a query per metric**.
3. **Act & motivate** — automated insights, anomaly alerts, budget-optimization recommendations (and optional auto-execution back into the ad platforms), plus the cultural war-room layer (goals, real-time wins, celebrations) that made BigBrain special.

## 3. Why now — how modern AI changes the game

BigBrain was a *dashboard*. GrowthOS is an *analyst*. What AI (LLMs + forecasting + causal tooling) unlocks that a 2016 BI tool could not:

- **Natural-language analytics** — "why did CAC jump in Germany last week?" answered against the real warehouse, with a chart and a written explanation.
- **Auto-generated metric definitions** — describe a funnel step in plain language; the system writes and validates the SQL/semantic model.
- **Narrative insights** — every dashboard gets an auto-written "what changed and why" summary, daily.
- **Predictive**: MRR/churn/LTV forecasts, cohort-payback projection, campaign fatigue prediction.
- **Creative intelligence** — vision models score ad creatives, cluster winning patterns, and draft new copy/variants.
- **Agentic actions** — an agent that proposes (or executes) budget shifts, bid changes, and audience tweaks, with guardrails and human approval.
- **Anomaly detection** — statistical + ML monitors on every metric, not just the few someone remembered to alert on.

## 4. Multi-business, multi-platform by design

The original was hard-wired to one SaaS funnel. GrowthOS treats the **funnel model as configuration**, so it fits:

- **SaaS / subscription** (signup → activation → paid → expansion → churn; MRR/ARR).
- **E-commerce / DTC** (visit → add-to-cart → purchase → repeat; ROAS, AOV, LTV).
- **Hybrid stores** selling **physical + digital + monthly/yearly subscription** products on one site — mixed carts, blended LTV/CAC, one revenue spine (see [`09-commerce-product-types.md`](09-commerce-product-types.md)).
- **Mobile apps** (install → activation → IAP/subscription; via MMPs like AppsFlyer/Adjust).
- **Lead-gen / services / local** (lead → qualified → deal → revenue; cost-per-qualified-lead).
- **Marketplaces** (supply & demand acquisition, take-rate, liquidity).

See [`05-multi-vertical.md`](05-multi-vertical.md) for the vertical adapter model.

## 5. Document map

| File | Contents |
|---|---|
| [`00-overview.md`](00-overview.md) | This file — vision, reference system, positioning |
| [`01-architecture.md`](01-architecture.md) | System architecture, tech stack, services, data flow |
| [`02-integrations.md`](02-integrations.md) | Ad platforms, analytics, billing, CRM connectors; ingestion & conversion API |
| [`03-ai-capabilities.md`](03-ai-capabilities.md) | AI analyst, NL query, insights, forecasting, creative & agentic optimization |
| [`04-data-model-and-metrics.md`](04-data-model-and-metrics.md) | Canonical schema, semantic metric layer, attribution, KPI catalog |
| [`05-multi-vertical.md`](05-multi-vertical.md) | Vertical adapters, funnel templates, extensibility |
| [`06-admin-and-security.md`](06-admin-and-security.md) | Admin console, RBAC, multi-tenancy, privacy/compliance, audit |
| [`07-roadmap.md`](07-roadmap.md) | Phased delivery plan, milestones, team, risks, success metrics |
| [`08-generic-platform.md`](08-generic-platform.md) | **Generic core**: org→project→env hierarchy, granular permissions/admins, open push Ingest API, plugin framework |
| [`09-commerce-product-types.md`](09-commerce-product-types.md) | **Unified commerce model**: physical, digital & subscription (monthly/yearly) products in one store — mixed carts, blended LTV/CAC, margin-aware optimization |
| [`10-product-ux.md`](10-product-ux.md) | Product & UX spec: navigation, key screens, war-room/TV, onboarding, notifications, design system, mobile |
| [`11-business-and-gtm.md`](11-business-and-gtm.md) | Competition, positioning & moats, pricing/packaging, GTM motion, unit economics, legal/platform-policy checklist |
| [`12-api-reference.md`](12-api-reference.md) | API contracts: Ingest (push), Metrics (read), outbound webhooks, plugin manifest, versioning |
| [`13-task-breakdown.md`](13-task-breakdown.md) | Executable backlog: Phase 0+1 epics → tasks with acceptance criteria, estimates, sprint map, critical path |
| [`14-gap-analysis.md`](14-gap-analysis.md) | Deep-dive gaps vs. BigBrain: NPS/feedback, DAU/MAU/L28, work lists & record feeds, CS leaderboards, experimentation, intent scoring — with adoption plan |

## 6. Guiding principles

1. **Warehouse-native** — we compute on the customer's data (or a managed warehouse), never lock metrics in a black box.
2. **Semantic layer is the contract** — every number is defined once, reused everywhere, and explainable.
3. **AI proposes, humans dispose** — automation is opt-in and reversible; every agent action is logged and approvable.
4. **Privacy first** — first-party data, consent-aware, conversion-API server-side, PII minimized and encrypted.
5. **Motivation is a feature** — goals, streaks, real-time wins and celebrations ship in v1, not as an afterthought.
6. **Config over code** — new metrics, funnels, and verticals are configuration, not deploys.
7. **Generic & pluggable core** — the platform knows only entities/events/measures; domains (marketing, e-com, CS) ship as metric-pack plugins, and any external system can push data via the open Ingest API.
8. **Multi-project with deny-by-default permissions** — org → project → environment hierarchy; every principal (human, service account, API key) acts through scoped role bindings; admins exist at every level.
