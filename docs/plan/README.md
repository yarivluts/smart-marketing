# GrowthOS — Full Plan Index

An AI-native, generic, multi-project growth-intelligence platform — the modern successor to monday.com's internal **BigBrain** (reverse-engineered from the HTML snapshots in this repo).

**One paragraph:** organizations create projects (products / brands / agency clients); any system pushes data in via an open Ingest API or plugins; a semantic metric layer computes CAC/LTV/ROAS/MRR across **physical, digital, and subscription products**; an AI analyst explains, predicts, and (with guardrails) acts back into Google/Meta/TikTok; and a real-time war-room keeps the team motivated.

## Reading order

| # | Doc | One-liner |
|---|---|---|
| 00 | [Overview](00-overview.md) | Vision, what BigBrain was, why AI changes it, principles |
| 08 | [Generic Platform Core](08-generic-platform.md) | **Read second.** Org→Project→Env, permissions/admins, push ingestion, plugins |
| 01 | [Architecture](01-architecture.md) | Services, stack (Next.js/TS + Python AI, BigQuery, Firestore via firebase-orm), data flow |
| 02 | [Integrations](02-integrations.md) | Ad platforms, pull connectors as plugins, conversion send-back, cost ledger |
| 04 | [Data Model & Metrics](04-data-model-and-metrics.md) | Canonical schema, semantic layer, attribution, cohorts, goals/war-room |
| 09 | [Commerce Product Types](09-commerce-product-types.md) | Physical + digital + monthly/yearly subscriptions in one store |
| 03 | [AI Capabilities](03-ai-capabilities.md) | NL analyst, insights, anomalies, forecasting, optimizer, agents |
| 05 | [Multi-Vertical](05-multi-vertical.md) | Vertical adapters as metric-pack plugins; agencies/white-label |
| 10 | [Product & UX](10-product-ux.md) | Screens, war-room/TV, onboarding, notifications, mobile |
| 06 | [Admin & Security](06-admin-and-security.md) | Admin consoles, RBAC, privacy/compliance, automation governance |
| 12 | [API Reference](12-api-reference.md) | Ingest/Metrics/webhooks contracts, plugin manifest |
| 11 | [Business & GTM](11-business-and-gtm.md) | Competition, pricing, GTM, unit economics, legal checklist |
| 07 | [Roadmap](07-roadmap.md) | Phases 0–5, team, risks, success metrics, next steps |
| 13 | [Task Breakdown](13-task-breakdown.md) | **The executable backlog**: Phase 0+1 epics → concrete tasks, acceptance criteria, sprint map |
| 14 | [Gap Analysis](14-gap-analysis.md) | Two deep passes vs. BigBrain (incl. all 71 saved report pages): **15 gaps** found & adopted — NPS, engagement depth, work lists, churn reasons, ROI-Nd, enrichment, omnisearch… |

## The seven load-bearing decisions

1. **Generic core, domain as plugins** — the platform knows only entities/events/measures; marketing/commerce ship as metric packs (`08`).
2. **Push-first ingestion** — any system integrates via API keys + schema registry, no connector required (`08 §3`, `12`).
3. **Semantic layer as the single source of truth** — one definition per metric, powering dashboards, APIs, and the AI alike (`04 §2`).
4. **Grounded AI with an action loop** — numbers only from the Metrics API; agents propose → humans approve → execute → verify → rollback (`03`).
5. **One commerce spine for all product types** — mixed carts of physical/digital/subscription, yearly normalized to MRR, margin-aware optimization (`09`).
6. **Hard isolation with invisible projects** — a user sees only projects they hold bindings on (404-not-403, no enumeration, per-project datasets & caches), enforced by an isolation test suite in CI (`08 §5.6`).
7. **Open by protocol** — full campaign write-back tiers (Read/Optimize/Manage) on Google/Meta (`02 §3`) and a first-party **MCP server** so any AI client can converse with and operate the platform (`12 §6`).

## Immediate next steps
See [07 §6](07-roadmap.md) — pick a design partner, stand up the generic core (hierarchy + RBAC + Ingest Gateway), ship the thin slice (Google+Meta+Stripe → CAC/TROI/MRR board + live war-room), and apply for Google/Meta API access **now** (long lead time).
