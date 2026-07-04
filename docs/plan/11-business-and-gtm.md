# 11 — Business Model, Competition & Go-To-Market

## 1. Competitive landscape (who we bump into)

| Category | Players | Their gap (our wedge) |
|---|---|---|
| E-com marketing analytics | Triple Whale, Northbeam, Hyros, Polar Analytics | E-com only; weak subscriptions/SaaS; little real automation |
| Subscription analytics | ChartMogul, Baremetrics, ProfitWell/Paddle | Billing-only view; no ad-spend join, no CAC/TROI loop |
| Product analytics | Mixpanel, Amplitude, PostHog | Events/funnels, but no spend, revenue-margin, or ad write-back |
| BI / dashboards | Looker, Metabase, Power BI, Tableau | Generic; every metric hand-built (the BigBrain problem); no domain AI, no actions |
| Warehouse-native metrics | Cube, dbt SL, Lightdash | Infrastructure for engineers, not a product for growth teams |
| Agencies' internal tools | spreadsheets + scripts | Our agency/white-label offering replaces these |

**Positioning:** "The AI growth analyst that joins **spend + funnel + revenue (any product type)** and closes the loop back into the ad platforms — generic enough for any business, alive enough to be your war-room."

**Moats (in order):** (1) closed action loop (send-back + guarded automation) with proven lift; (2) semantic layer + AI eval quality; (3) plugin ecosystem; (4) opt-in cross-tenant benchmarks; (5) the cultural war-room layer nobody else treats as a feature.

## 2. Pricing & packaging (hypothesis to validate)

Value metric: **tracked monthly revenue + data volume + AI usage** (not seats — insight should spread freely; seats capped only at Starter).

| Plan | For | Includes | Price anchor |
|---|---|---|---|
| **Starter** | small store/startup | 1 project, 3 sources, core dashboards + war-room, daily digest, limited AI questions | free / ~$49–99/mo |
| **Growth** | scaling business | unlimited sources, AI Analyst, anomalies, attribution models, conversion send-back | ~$300–800/mo tiered by tracked revenue |
| **Pro** | multi-product / hybrid stores | multi-project, optimizer + agent automations, forecasting, custom metrics/roles | ~$1–3k/mo |
| **Agency** | agencies | portfolio view, white-label, client seats, cross-client benchmarks | per managed project |
| **Enterprise** | large | BYO-warehouse, SSO/SCIM, residency, SLAs, custom plugins, security review | custom |

Add-on: AI token packs beyond fair-use; paid premium plugins (marketplace rev-share later).

## 3. GTM motion

1. **Design partners (Phase 1–2):** 5–10 hand-held companies across SaaS + hybrid store + agency; weekly feedback loop; case studies with measured CAC/ROAS lift (the `07 §5` value metrics become sales collateral).
2. **PLG (Phase 3+):** self-serve onboarding (`10 §2.6`), free Starter, "powered by GrowthOS" on shared dashboards, template/plugin gallery as SEO surface.
3. **Agency channel (Phase 4–5):** agencies bring many clients per deal; white-label makes us their product.
4. **Content engine:** benchmark reports from opt-in data ("2027 hybrid-store CAC report"), the war-room as a demo-able viral artifact (TV screenshots travel).
5. **Marketplace integrations:** listings in Shopify App Store, Stripe App Marketplace, Slack directory, Google/Meta partner programs — each is a discovery channel and a trust signal.

## 4. Unit economics guardrails (our own dogfood)

- Track our own CAC/LTV/payback **inside GrowthOS** from day one (ultimate dogfooding + demo).
- Warehouse + LLM cost per tenant monitored as **COGS**; alert when a tenant's gross margin < 70% (drives caching/model-routing work, `03 §10`).
- North-star: **weekly active projects that took an action** (viewed→asked→acted funnel), not dashboards viewed.

## 5. Legal & platform-policy checklist (blockers if ignored)

- Google Ads API & Meta Marketing API developer-token/app-review processes take **weeks–months** → apply in Phase 0, not when the connector is ready.
- Meta CAPI / Google EC data-use terms; ad-platform ToS on automated changes (rate + scope limits).
- DPA templates, sub-processor list, ToS/privacy for the Ingest API (customers push *their* users' data → we're a processor).
- Trademark check on the product name before public launch.
