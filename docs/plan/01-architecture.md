# 01 — System Architecture

## 1. High-level shape

```
                          ┌────────────────────────────────────────────────┐
                          │                 GrowthOS Cloud                  │
                          │                                                 │
  Ad platforms ──┐  OAuth │  ┌────────────┐  ┌───────────┐   ┌──────────┐  │
  Analytics      ├────────┼─▶│ Source     │─▶│ Warehouse │──▶│ Semantic │  │
  Billing / CRM ─┘  pull  │  │ Plugins    │  │ (BigQuery/│   │  Metric  │  │
  (Google/Meta/GA4/       │  │ (Connector │  │ Snowflake)│   │  Layer   │  │
   Stripe/HubSpot/…)      │  │  Service)  │  └─────┬─────┘   └────┬─────┘  │
                          │  └────────────┘        │              │        │
  Any system ────┐  push  │  ┌────────────┐  ┌─────▼──────┐  ┌────▼─────┐  │
  (custom apps,  ├────────┼─▶│ Ingest     │  │  Modeling  │  │  Metrics │  │
   backends, IoT,│  keys/ │  │ Gateway    │  │ (dbt/SQL)  │  │    API   │  │
   SaaS webhooks)│  HMAC  │  │ (validate, │  └────────────┘  └────┬─────┘  │
                 │        │  │  DLQ — 08) │  ┌────────────┐       │        │
   SDKs/streams ─┘        │  └────────────┘  │ Identity/  │       │        │
                          │                  │ Attribut.  │       │        │
                          │                  └────────────┘       │        │
                          │  ┌──────────────────────────────┐ ┌───▼─────┐  │
  Conversions ◀───────────┼──│  AI Layer (LLM orchestration, │ │  App    │  │
  (send-back via          │  │  forecasting, insights,       │◀│  API /  │  │
   action plugins)        │  │  agents, anomaly detection)   │ │  BFF    │  │
                          │  └──────────────────────────────┘ └───┬─────┘  │
                          └───────────────────────────────────────┼────────┘
                                                                  │
                                        Web app · War-room TV · Mobile · Slack/Email
```

## 2. Core services (bounded contexts)

| Service | Responsibility |
|---|---|
| **Ingest Gateway** | The open **push** entry point (see `08`): Ingest API (events/entities/measures), per-project webhook receiver, SDK/stream endpoints, API-key/HMAC auth, schema validation, quarantine + dead-letter/replay, rate limits. |
| **Plugin Runtime & Registry** | Hosts sandboxed plugins (source, transform, metric pack, action, AI tool, panel) with scoped credentials; registry/marketplace, versioning, install per project (see `08 §4`). |
| **Connector Service** | OAuth, credential vault, per-platform API clients, incremental sync scheduling, rate-limit handling, backfill. Pull connectors are implemented as **source plugins** on the Plugin Runtime. |
| **Ingestion / ELT** | Land raw platform data → warehouse (EL), then transform (dbt models) into canonical tables. Airbyte/Fivetran-style connectors where they exist; custom for the rest. |
| **Identity & Attribution** | Stitch anonymous → known users; resolve touchpoints to a canonical customer; run attribution models (see `04`). |
| **Semantic Metric Layer** | Single definition of every metric/dimension (CAC, LTV, ROAS, MRR, churn…). Compiles to warehouse SQL. Powers both dashboards and the AI. |
| **Metrics API** | Query interface over the semantic layer (metric + dimensions + filters + time grain) with caching. |
| **AI Orchestration** | LLM router, tool-calling, RAG over the semantic layer/schema, NL→metric query, insight generation, agent runtime. See `03`. |
| **Forecasting/ML** | Time-series forecasts, anomaly detection, churn/LTV propensity, budget-optimizer. |
| **Automation / Actuation** | Executes approved actions back into ad platforms (budget, bids, pause) + Conversions API upload. Guardrails, dry-run, rollback. |
| **Alerting & Notifications** | Anomaly + goal + digest delivery to Slack, email, mobile push, war-room. |
| **App API / BFF** | Auth, tenancy, dashboards, goals, war-room, saved views. GraphQL or tRPC for the frontend. |
| **Admin Service** | Tenant, user, billing, connector, feature-flag, and content management (see `06`). |

## 3. Recommended tech stack

Chosen to be modern, hireable, and fast to build — while staying compatible with the user's existing ecosystem (Firebase + `arbel/firebase-orm`).

**Frontend**
- **Next.js (App Router) + React + TypeScript**, Tailwind + a component lib (shadcn/ui).
- Charts: ECharts or Visx/Recharts; virtualized tables for big cohort grids.
- **Real-time**: WebSocket/SSE (Ably/Pusher/Supabase Realtime) for the live war-room — the spiritual successor to BigBrain's Pusher-driven payment feed.
- i18n from day one (RTL/Hebrew + LTR), translations in resource files only (no hard-coded UI strings; **no Hebrew in code files**, only in translation files).

**Backend**
- **Node.js/TypeScript (NestJS)** or **Python (FastAPI)** for services. Python is attractive for the ML/AI services; a polyglot split (TS for app/API, Python for AI/ML) is fine over a shared message bus.
- **Operational store**: Firestore via **`arbel/firebase-orm`** for app/tenant/config/goals/user data (per house rules — all Firestore access goes through firebase-orm). 
- **Analytical store (warehouse)**: **BigQuery** (natural with Firebase/GCP) or Snowflake/ClickHouse. This is where ad + funnel + revenue data is joined and modeled. Keep OLTP (Firestore) and OLAP (warehouse) separate.

> **Database decision — can we run on Firebase alone? No.** The split is mandatory, not stylistic:
> - **Firestore = definitions & state** (identity/orgs/memberships, RBAC, keys, schema registry, metric definitions, dashboards, goals, win rules) — key-lookup reads, realtime listeners (war-room feed), transactional writes.
> - **BigQuery = facts & math** (events, spend, orders, touchpoints; every metric/cohort/attribution query). Firestore has no joins/group-by, per-document read pricing makes million-row scans absurd, and the AI Analyst + semantic layer compile to SQL — without a SQL engine there is no NL analytics and every metric regresses to hand-coded aggregation jobs (the BigBrain anti-pattern).
> - Supporting cast: **Redis** (metric-result cache + API-key rate limiting; deferrable to Phase 1), **Pub/Sub** (ingest pipeline), vector store later for RAG (`03`).
> - Practical upside: same GCP project/billing/IAM as Firebase; BigQuery free tier (10GB storage, 1TB queries/mo) covers MVP scale; official Firestore→BigQuery streaming extension exists for the operational-data mirror.
> - Rule of thumb: **configuration lives in Firestore; numbers are computed in BigQuery.**
- **Transformations**: dbt (SQL models) orchestrated by Dagster/Airflow or Cloud Workflows.
- **Queue/stream**: Pub/Sub (GCP) or Kafka for ingestion + event fan-out.
- **Cache**: Redis for metric-query results and rate-limit budgets.

**AI/ML**
- **LLM**: Claude (Anthropic) as the primary model for the analyst, NL→SQL, insight narration, and agents — using tool-calling + the Metrics API as tools. Model IDs and usage per the `claude-api` reference; default to the latest capable models (Opus for hard reasoning/agents, Haiku for cheap high-volume classification like creative tagging).
- **Forecasting**: Prophet/NeuralProphet, statsmodels, or a lightweight gradient-boosting model for propensity.
- **Vector store**: pgvector/Vertex for RAG over schema, docs, and past insights.

**Infra**
- GCP (aligns with Firebase/BigQuery) or cloud-agnostic on Kubernetes. IaC via Terraform. Secrets in Secret Manager. Observability: OpenTelemetry + Grafana/Datadog.

## 4. Data flow (a signup-to-paid example)

1. **Ingest**: Connector Service pulls yesterday's Google Ads + Meta spend/clicks/impressions by campaign; GA4/Segment sends web events; Stripe sends invoices/subscriptions; all land raw in the warehouse.
2. **Model**: dbt builds canonical `ad_spend`, `touchpoints`, `users`, `subscriptions`, `revenue_events` tables (schema in `04`).
3. **Attribute**: Identity/Attribution stitches the anonymous click → signup → paying customer and assigns credit across channels.
4. **Define**: Semantic layer exposes `CAC`, `TROI`, `Payback`, `MRR`, `Net MRR Churn`, `LTV:CAC` as reusable metrics over those tables.
5. **Serve**: Dashboards + war-room query the Metrics API; results cached.
6. **Reason**: AI layer generates the daily "what changed & why", flags anomalies, forecasts month-end MRR, and drafts budget recommendations.
7. **Act**: On approval, Automation service shifts budget in Google/Meta and uploads conversions back via each platform's Conversions API to improve their optimization.

## 5. Multi-tenancy & isolation

- **Hierarchy: Organization → Project → Environment** (full model in `08 §1`). Org = billing/tenant boundary; **Project = data-isolation boundary** (one org holds many projects — products, brands, agency clients); Environment separates prod from staging/dev data.
- Every row in Firestore and every warehouse table is namespaced/partitioned by `org_id/project_id/env`; permission checks run against the same hierarchy (deny-by-default RBAC, `08 §5`).
- Warehouse isolation options (pick by tier): shared dataset + row-level filters (cheap) → per-project dataset (mid) → per-org project (enterprise/BYO-warehouse).
- **BYO-warehouse**: enterprise customers point GrowthOS at their own BigQuery/Snowflake; we run models there and never copy raw data out.
- Credential vault: OAuth tokens encrypted per tenant (KMS envelope encryption); no cross-tenant access path.

## 6. Non-functional targets

- Dashboard metric queries: p95 < 1.5s (served from cache/pre-agg).
- Ingestion freshness: ad/spend data ≤ 3h; billing/webhooks near-real-time; war-room events < 5s.
- Availability 99.9%; graceful degradation if a single connector is down (stale badge, not a blank board).
- Scales to thousands of tenants × dozens of connectors each via per-connector incremental sync + backpressure.
