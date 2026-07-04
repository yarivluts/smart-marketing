# 09 — Unified Commerce Model: Physical, Digital & Subscription Products

Real stores are **hybrid**: one website can sell physical goods (shipped), digital products (downloads, licenses, courses), and recurring subscriptions (monthly/yearly) — often in the same cart. The platform must model all of them in **one unified commerce model** so metrics, attribution, LTV, and the war-room work across product types without special-casing.

This extends the canonical data model (`04`) and ships as part of the commerce metric packs (`05`), on top of the generic entity/event/measure core (`08 §2`).

## 1. Product catalog (generic, type-aware)

```
dim_product(product_id, project_id, sku, name, category,
            product_type,            -- physical | digital | subscription | bundle | service
            fulfillment_kind,        -- shipped | download | license_key | access_grant | seat | none
            unit_cost?, weight?,     -- physical: COGS + shipping inputs
            recurrence?,             -- subscription: monthly | yearly | custom interval
            trial_days?, billing_scheme?,   -- subscription: trial, per-seat/flat/usage
            entitlements[])          -- digital/subs: what access it grants

dim_price(price_id, product_id, currency, amount, interval?, tier?)   -- multiple price points per product
dim_bundle(bundle_id -> component product_ids + allocation weights)   -- mixed bundles
```

- `product_type` is the discriminator; everything downstream (margin, LTV, renewal logic) branches on it **in the semantic layer**, not in code.
- **Bundles** (e.g., physical device + yearly service plan) split revenue across components by allocation weights — critical for correct MRR vs. one-off accounting.
- Catalog syncs in from commerce platforms (Shopify/WooCommerce products, Stripe Products/Prices, app stores) via source plugins, or is pushed via the Ingest API (`08 §3`) by custom stores.

## 2. Orders & revenue — one spine, three behaviors

Every sale flows through the same order spine; type-specific facts hang off it:

```
fact_order(order_id, project_id, customer_id, ts, channel/touchpoint link,
           gross, discounts, shipping_charged, tax, net, currency, status)
fact_order_line(order_id, line_id, product_id, price_id, qty, amount, product_type)

-- Physical
fact_fulfillment(order_id/line_id, status: pending→shipped→delivered→returned,
                 carrier, shipping_cost_actual, warehouse)
fact_return(line_id, ts, reason, refund_amount, restock?)

-- Digital
fact_delivery(line_id, ts, kind: download|license|access, license_key?, download_count)

-- Subscription
dim_subscription(subscription_id, customer_id, product_id, price_id,
                 interval: monthly|yearly, seats?, status,
                 trial_start/end, started_at, current_period_end,
                 cancel_at_period_end?, canceled_at?, mrr_normalized)
fact_subscription_event(subscription_id, ts, type:
                 trial_start | convert | renew | upgrade | downgrade |
                 seat_change | pause | resume | cancel | churn | reactivate | payment_failed | dunning_recovered)
fact_revenue_event(...)   -- unchanged from 04: every charge/refund, with mrr_delta for subs, 0 for one-off
```

Key rules:
- **Yearly plans are normalized to MRR** (`amount/12` → `mrr_normalized`) so monthly+yearly report on one MRR line, while cash-collected reports separately (BigBrain's "Collection" vs. MRR distinction, kept).
- **Refunds/returns** reduce both revenue and attribution credit retroactively (net-revenue attribution), and physical returns feed contribution margin.
- **Mixed carts** are native: one `fact_order` with lines of different `product_type`s; each line routes to its own downstream facts.

## 3. Metrics per product type (semantic-layer packs)

All defined once in the semantic layer (`04 §2`); the AI Analyst understands the distinctions.

| Area | Physical | Digital | Subscription |
|---|---|---|---|
| Revenue | net revenue, AOV, units | net revenue, AOV | **MRR/ARR**, movements (new/expansion/contraction/churn), cash collected |
| Margin | **contribution margin** = net − COGS − shipping − returns − payment fees | near-100% margin (minus fees/hosting) | gross margin after serving cost |
| Repeat/retention | repeat-purchase rate, time-between-orders | re-purchase / cross-sell rate | **renewal rate, net MRR churn, trial→paid conversion, monthly↔yearly mix** |
| LTV | repeat-purchase LTV (BG/NBD-style) | purchase LTV | survival-based subscription LTV |
| Marketing | **POAS/contribution ROAS** (not just revenue ROAS) | ROAS, CAC | **CAC, LTV:CAC, payback months** |
| Ops | fulfillment SLA, return rate, stock-out impact | delivery/download failures, license activations | **failed charges, dunning recovery, involuntary churn** |

**Blended (the hybrid-store headline numbers):**
- `total_net_revenue = one_off_net + subscription_collected`
- `blended_ltv` per customer across all product types (a customer who buys a device *and* subscribes is one LTV)
- `blended CAC / payback` where subscription payback accounts for the margin of attached physical/digital purchases
- Revenue-mix dashboard: one-off vs. recurring share, monthly-vs-yearly mix, bundle attach rate, **cross-type conversion** (e.g., % of physical buyers who later subscribe — a key hybrid-store growth lever).

## 4. Product-type-aware intelligence (AI layer additions)

- **Attribution & send-back** (`02 §4`): conversion values sent to ad platforms use the right value per type — contribution margin for physical, first-year expected value (or LTV-adjusted) for subscriptions, so Google/Meta optimize toward *profit*, not gross revenue.
- **Churn radar** (`03 §7`) extends to: subscription renewal risk (incl. yearly-renewal early-warning cohort), physical repeat-purchase lapse prediction, and dunning/failed-charge recovery plays.
- **Optimizer** (`03 §6`) respects margin structure per type — never recommends scaling a campaign whose "great ROAS" is on low-margin, high-return physical SKUs.
- **Forecasting**: inventory-aware demand forecast for physical; MRR forecast for subs; blended cash-flow projection.
- **War-room wins** (`04 §6`) per type: big order shipped, license sold, new subscriber, yearly upgrade, dunning save — each with its own celebration rule.

## 5. Integration mapping (how the data arrives)

| Source | Maps to |
|---|---|
| **Shopify / WooCommerce / custom cart** (source plugin or Ingest API) | catalog, `fact_order(+lines)`, fulfillment, returns |
| **Stripe / Paddle / Chargebee / Recurly** | subscriptions, invoices, charges, failed payments, dunning |
| **RevenueCat / app stores** | mobile subscriptions & IAP |
| **Digital-delivery / LMS / licensing systems** (webhook mapping, `08 §3.2`) | `fact_delivery`, activations, course progress |
| **3PL / shipping (ShipStation etc.)** | actual shipping costs, delivery SLA |
| **Custom stores** | push everything via Ingest API with the commerce schemas registered from this pack |

Deduplication across sources (e.g., a Shopify order paid via Stripe) is handled by natural-key reconciliation (order id / invoice id / charge id) in the modeling layer.

## 6. Admin additions (per house rule — management section)

- **Catalog manager**: view/override product types, unit costs (COGS), bundle allocation weights, entitlements — with bulk import.
- **Revenue-recognition settings**: MRR normalization rules, refund handling policy, fee/margin inputs per payment provider.
- **Subscription-plan mapping**: map provider plans/prices → products; monthly/yearly grouping.
- **Send-back value rules**: which value (revenue / margin / expected LTV) is uploaded per product type per platform.
- All admin data via Firestore + `arbel/firebase-orm`; every change audited (`06`).

## 7. Rollout

- Phase 1 (`07`): order spine + subscription model (Stripe) — covers subscriptions + simple digital sales.
- Phase 4 e-commerce pack: physical fulfillment, returns, COGS/contribution margin, Shopify plugin.
- Hybrid-store blended metrics + cross-type conversion + margin-aware send-back: with Phase 4, since they need both halves live.
