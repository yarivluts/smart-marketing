# 05 — Multi-Business & Multi-Platform Support

BigBrain was welded to one SaaS funnel. GrowthOS makes the **funnel and metrics configuration**, so the same engine serves many business types. This is achieved with **Vertical Adapters** on top of the canonical model (`04`). Concretely, each vertical ships as a **metric-pack plugin** (`08 §4`): a bundle of registered schemas + semantic metrics + default dashboards + war-room "win" rules, installable per project from the plugin registry.

## 1. The abstraction: everything is a funnel + spend + revenue

Every supported business reduces to:

```
Spend (channels)  →  Touchpoints  →  Funnel steps  →  Revenue events  →  Retention/LTV
```

A **vertical** is just:
1. A **funnel template** (ordered steps + which step = "acquired", which = "monetized").
2. A **revenue model** (subscription MRR vs. one-off orders vs. IAP).
3. A **KPI pack** (the metrics that matter, from the catalog, with sensible defaults).
4. A **connector recommendation set** (which integrations to prioritize).
5. A **"win" definition** for the war-room.

## 2. Built-in vertical adapters

### SaaS / subscription (the BigBrain-native case)
- Funnel: `visit → signup → activation → paid → expansion → churn`.
- Revenue: MRR/ARR; movements (new/expansion/contraction/churn).
- KPI pack: MRR, net MRR churn, CAC, LTV:CAC, payback, conversion-to-paying, cohort retention, TROI.
- Wins: new paid, upgrade, annual plan.

### E-commerce / DTC
- Funnel: `visit → view product → add-to-cart → checkout → purchase → repeat`.
- Revenue: orders (AOV, units), refunds; predicted LTV via repeat-purchase models.
- KPI pack: ROAS, blended ROAS/MER, CAC, AOV, contribution margin, repeat rate, new-vs-returning revenue.
- Connectors: Shopify/WooCommerce, Meta/Google/TikTok, Klaviyo (email).
- Wins: large order, first repeat purchase, record day.

### Hybrid store (physical + digital + subscriptions on one site)
- The common real-world case: a site sells shipped goods, downloads/licenses/courses, **and** monthly/yearly subscriptions — often in the same cart.
- Built on the unified commerce model in [`09-commerce-product-types.md`](09-commerce-product-types.md): one order spine, `product_type` per line, yearly plans normalized to MRR.
- KPI pack: revenue mix (one-off vs. recurring), blended LTV/CAC, subscription renewal + trial conversion, contribution margin per type, **cross-type conversion** (physical buyer → subscriber), bundle attach rate.
- Wins: new subscriber, yearly upgrade, big shipped order, dunning save — each with its own celebration rule.

### Mobile apps
- Funnel: `impression → install → activation → IAP/subscription → retention`.
- Revenue: RevenueCat/store; SKAdNetwork/MMP-aware attribution.
- KPI pack: CPI, install→trial→paid, D1/D7/D30 retention, ROAS by MMP, ARPDAU.
- Connectors: AppsFlyer/Adjust, Apple Search Ads, Google, Meta, TikTok.

### Lead-gen / services / local / B2B
- Funnel: `visit → lead → MQL → SQL → deal → revenue` (CRM-driven, longer cycle).
- Revenue: deal value from CRM; offline-conversion upload back to ads is critical.
- KPI pack: cost-per-lead, cost-per-qualified-lead, lead→deal rate, pipeline value, CAC, sales-cycle length.
- Connectors: HubSpot/Salesforce/Pipedrive, Google/Microsoft/LinkedIn (B2B intent), call-tracking.
- Wins: SQL created, deal closed.

### Marketplaces
- Two funnels (supply + demand); metrics for liquidity, take-rate, GMV, buyer/seller CAC.

## 3. How a new vertical is added (no core code change)

1. Author a **funnel template** (steps + monetization step) in config.
2. Map the vertical's revenue source to `fact_revenue_event`/`fact_order` via an existing connector or a mapping.
3. Select/define KPI pack metrics from the semantic layer (or let AI author new ones — `03 §9`).
4. Define the "win" event rule for the war-room.
5. Ship as a selectable template in onboarding.

Because metrics live in the semantic layer and funnels are config, **a new vertical is content, not a deploy** — the operational goal from the overview's "config over code" principle.

## 4. Multi-platform in two senses

**(a) Many ad/data platforms** — covered by the connector contract in `02`; adding a platform = implementing one connector.

**(b) Many surfaces GrowthOS itself runs on:**
- **Web app** (primary).
- **War-room / TV mode** (office + remote).
- **Mobile app** (exec metrics, approvals, push alerts).
- **Slack/Teams** (digests, anomaly alerts, agent approvals, ask-the-analyst inline).
- **Embedded/white-label** (agencies embed dashboards for their clients — see below).
- **API/webhooks** for customers to pull metrics into their own tools.

## 5. Agencies & multi-account (a major market the original ignored)

- **Portfolio view**: an agency or holding company manages many client tenants under one login; roll-up + per-client drill-down.
- **White-label**: custom domain, logo, theme; client-facing read-only dashboards.
- **Benchmarks**: anonymized, aggregated, opt-in cross-tenant benchmarks ("your CAC vs. e-com median") — a data-network moat, privacy-safeguarded (k-anonymity, no per-tenant leakage).

## 6. Localization & regional correctness

- Full **i18n** (RTL Hebrew/Arabic + LTR); all UI strings in translation resource files — **never hard-code display strings, and no Hebrew text inside code files**, only in translation files.
- Multi-currency with historical FX; per-tenant reporting currency.
- Regional holiday/work-week calendars (BigBrain already split Work Week vs. Weekend) drive seasonality baselines for anomaly detection and forecasting.
- Region-aware privacy defaults (GDPR/CCPA/consent mode) — see `06`.

## 7. Extensibility summary

| Extend… | Mechanism | Who can do it |
|---|---|---|
| New ad/data platform | Implement connector contract (`02`) | Engineering |
| New metric | Semantic-layer definition (or AI-authored) | Ops / power user / AI |
| New funnel / vertical | Funnel template + KPI pack config | Ops / customer |
| New dashboard | Drag-drop or AI-generated from existing metrics | Any user |
| New automation | Policy + agent action config with guardrails | Admin |
