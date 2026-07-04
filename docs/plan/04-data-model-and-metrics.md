# 04 — Canonical Data Model, Semantic Layer & Metrics

The heart of the platform: **one canonical model** that every platform maps into, a **semantic layer** that defines every metric once, and an **attribution engine** that connects spend → customer → revenue. This is the generalized version of the hand-built joins that produced BigBrain's TROI, CAC, and cohort reports.

## 1. Canonical warehouse schema (core tables)

All tables carry `tenant_id`. Times in UTC; money normalized to reporting currency at event date.

```
dim_channel(channel_id, platform, name)                       -- google, meta, tiktok, organic, ...
dim_campaign(campaign_id, channel_id, name, objective, ...)   -- + adset/adgroup/ad hierarchy
dim_date(date, dow, is_weekend, is_holiday[region])           -- BigBrain tracked Work Week vs Weekend

fact_ad_spend(date, tenant_id, channel_id, campaign_id, adset_id, ad_id,
              impressions, clicks, spend, platform_conversions, platform_conv_value,
              currency, reporting_spend)

fact_touchpoint(touchpoint_id, tenant_id, anon_id, user_id?, ts,
                channel_id, campaign_id, ad_id, click_id{gclid,fbclid,ttclid},
                utm{source,medium,campaign,content,term}, landing_page, device, geo, consent)

dim_customer(customer_id, tenant_id, first_seen, geo, plan?, account_size?, segment...)
bridge_identity(anon_id -> customer_id, method, confidence)   -- identity stitching

fact_funnel_event(event_id, tenant_id, customer_id, anon_id, ts,
                  event_name, step, value?, properties)        -- signup, activate, qualified, ...

fact_revenue_event(id, tenant_id, customer_id, ts, type,       -- charge, refund, upgrade, downgrade
                   amount, mrr_delta, plan, invoice_id, status) -- status ← failed charges too

dim_subscription(subscription_id, customer_id, plan, mrr, status, started_at, canceled_at)

fact_attribution(customer_id, conversion_event, model, channel_id, campaign_id, credit)  -- see §4
```

E-commerce/mobile variants add `fact_order`, `fact_install`, `fact_in_app_event`, mapped by the vertical adapter (`05`).

> **Product types:** the full commerce spine — `dim_product` (physical / digital / subscription / bundle), `fact_order(+lines)`, fulfillment/returns, digital delivery, and the subscription lifecycle (monthly/yearly with MRR normalization) — is specified in [`09-commerce-product-types.md`](09-commerce-product-types.md). One site can sell all types at once; metrics branch on `product_type` in the semantic layer, not in code.

## 2. Semantic metric layer

Every metric is defined **once** as config (YAML/DB), compiled to warehouse SQL, and consumed by dashboards, the Metrics API, and the AI. Example definitions:

```yaml
metrics:
  - name: ad_spend
    agg: sum(fact_ad_spend.reporting_spend)
  - name: signups
    agg: count_distinct(fact_funnel_event.customer_id where step='signup')
  - name: new_paying
    agg: count_distinct(fact_revenue_event.customer_id where type='first_charge')
  - name: cost_per_signup            # BigBrain "FB CPS", generalized to any channel
    formula: ad_spend / signups
  - name: cac
    formula: ad_spend / new_paying
  - name: conversion_to_paying
    formula: new_paying / signups
  - name: mrr
    agg: sum(dim_subscription.mrr where status='active')
  - name: net_mrr_churn
    formula: (churned_mrr - expansion_mrr) / starting_mrr
  - name: ltv
    formula: arpa * gross_margin / revenue_churn_rate
  - name: ltv_to_cac
    formula: ltv / cac
  - name: troi                       # BigBrain "True ROI"
    formula: attributed_gross_profit / ad_spend
  - name: payback_months
    formula: cac / (arpa * gross_margin)

dimensions: [channel, campaign, adset, ad, geo, device, plan, segment, cohort_month, landing_page]
```

**Why a semantic layer:** consistency (one definition of CAC everywhere), reuse, explainability (the AI reads these definitions), and **config-not-code** extensibility. Implement on dbt Semantic Layer / Cube / MetricFlow, or a lightweight in-house compiler.

## 3. Metric catalog (maps BigBrain → GrowthOS, generalized)

| BigBrain report | GrowthOS metric(s) | Notes |
|---|---|---|
| Paying accounts growth, conversion-to-paying | `new_paying`, `conversion_to_paying`, `paying_accounts` | funnel step-configurable per vertical |
| Paying / behavior cohorts | cohort retention & conversion by `cohort_month` | generic cohort engine |
| Monthly/daily collection, failed charges, coupons | `collected_revenue`, `failed_charge_rate`, `coupon_impact` | from billing connector |
| MRR growth, cohort, net/gross churn, pyramid, new-MRR dist. | `mrr`, `mrr_movement{new,expansion,contraction,churn}`, `net_mrr_churn` | pyramid = MRR by band |
| Account upgrades, upgrade potential | `expansion_mrr`, upgrade propensity | + AI expansion radar |
| **TROI**, acquisition cohort, **campaying**, **spend distribution**, **FB CPS**, organic growth | `troi`, `cac`, `cost_per_signup`, `spend_share`, cohort payback | the marketing core |
| Landing page, banners, intent breakdown | LP conversion rate, banner CTR, intent segments | creative/LP analytics |
| Weekly retention, events-count, survival | retention curves, engagement events, survival analysis | product analytics |
| MAU/DAU activity, **L28 histogram** | `dau/wau/mau`, `dau_mau_ratio` (stickiness), **LN engagement-depth histograms**, power-user curve | engagement pack (gap 2, `14`) |
| NPS data + analysis, NPS goal | `nps`, `csat`, response trends by segment + **AI theme clustering** of open answers | feedback pack (gap 1, `14`) |
| Intent breakdown, upgrade potential | at-signup **intent/quality score**, quality-adjusted CPS/CAC, intent-mix alerts | AI scoring (gap 4, `14`) |
| Recent paying/churn/upgrades-failed, last demos, **paying-no-demo** | live record feeds + **saved segments as work lists** (owner, status, CRM sync) | ops layer (gap 5, `14`) |
| Customer-success agent board | first-response/resolution time, CSAT & closes **per agent**, team leaderboards | CS pack + people layer (gap 6, `14`) |
| Banners, landing pages | experiment/variant/exposure results + significance | experimentation (gap 3, `14`) |
| Recent churn (reason/text/category) | structured + free-text **churn reasons**, AI-clustered taxonomy, reason × cohort/channel breakdowns | gap 10, `14` |
| Campaign Monitoring (Coll.40, ROI(40), Pred ROI, Target SC) | **`roi_nd`/`collection_nd`** fixed-window payback family, **per-campaign targets**, predicted-vs-actual calibration | gap 12, `14` |
| Paying distribution by country/plan/category | firmographic-enriched composition (industry/size/geo), **# vs $ weighted**, new-vs-total | gap 11, `14` |
| War-room: resurrected + on-trial companies | `reactivations` metric + win type, trial-pipeline widget | gap 14, `14` |
| Get them Moneys | rep-attributed collections ledger + leaderboards | gap 13, `14` |
| Churn analysis / cohort, LTV, monthly account churn | `churn_rate`, `ltv`, `ltv_to_cac` | + AI churn radar |
| KPIs war-room, company goals, customer success | goal progress, real-time wins, CS response time | see §6 |

## 4. Identity & attribution engine

**Identity stitching**: anon click → known user via deterministic keys (email hash, user_id, click IDs) first, probabilistic fallback with a confidence score. Stored in `bridge_identity`.

**Attribution models** (all computed, all labeled — never a single opaque number):
- Rules-based: first-touch, last-touch, last-non-direct, linear, time-decay, position-based.
- **Data-driven attribution (DDA)**: Markov-chain removal-effect or Shapley over `fact_touchpoint` paths.
- **Incrementality**: geo-holdout & conversion-lift test framework — the honest answer to "did this spend actually cause revenue?", surfaced alongside platform-reported numbers.
- Always show **platform-reported vs. GrowthOS-modeled** side by side so users understand walled-garden inflation.

Configurable per tenant: default model, lookback windows per channel, view-through inclusion.

## 5. Cohorts, retention & LTV

- Generic **cohort engine**: pick cohort key (signup month, first channel, plan), a metric (retention, revenue, payback), and a grain → matrix + curves. Reused for acquisition cohorts, MRR cohorts, behavior cohorts, survival.
- **LTV**: historical (realized) + predicted (propensity/BG-NBD-style for e-com, survival-based for subscription). Feeds `ltv_to_cac` and payback.

## 6. Goals, war-room & the cultural layer

BigBrain's soul was its **KPI war-room** (real-time payment feed with confetti/sound, per-manager celebration) and **company-goal thermometers**. We keep and modernize it:

- **Goals**: define any metric target (e.g., "MRR \$1M by Q4", "signups 4096" — BigBrain literally had a `next_goal`) with pacing, progress thermometer, and AI "will we hit it?" projection. Goals support **direction** (maximize / minimize — e.g., signup cost / stay-in-range) and **calendar rhythm** (separate work-week vs. weekend targets, as BigBrain's goals board did), and mix revenue goals with quality goals (NPS, conversion, intent mix) on one board.
- **People & teams layer**: `dim_team_member` (name, photo, team, role) so wins, leaderboards, and CS/sales metrics attribute to a person — BigBrain's per-manager photos and celebration sounds, generalized.
- **Real-time win feed**: new paid/upgrade/big-order events stream to the war-room in < 5s (via the realtime channel), with optional **celebration** (confetti + sound), owner attribution ("closed by <rep>"), and a leaderboard.
- **TV mode**: full-screen rotating war-room for the office / remote team.
- **Customer-success board**: live response-time and health, mirroring BigBrain's CS dashboard, now with churn-risk overlay.

These are configuration + a realtime event rule engine, so any vertical defines what counts as a "win".

## 7. Data quality & trust

- dbt tests + freshness checks on every canonical table; failing tests badge the affected metrics.
- **Metric lineage**: every number traces to its definition → models → source rows (clickable), so users (and the AI) can audit any figure.
- Currency/timezone correctness treated as first-class (multi-region tenants).
- Versioned metric definitions: changing a definition is tracked, and historical dashboards can pin a version.
