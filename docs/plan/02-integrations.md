# 02 — Integrations & Data Ingestion

The whole product stands on getting **spend, funnel, and revenue** data into one model — and (for ad platforms) sending optimized conversion signals back out. This is the layer BigBrain hand-built for Google + Facebook; we generalize it.

> **Framing (see `08`):** ingestion is **push-first and pluggable**. Any system can send data through the open **Ingest API / webhooks / SDKs / streams** without us building anything (`08 §3`). The pull connectors below are **source plugins** on the plugin runtime (`08 §4`) — the high-value ones we build and maintain ourselves. Everything lands in a project+environment, authorized by scoped API keys.

## 1. Integration categories

| Category | Purpose | Examples |
|---|---|---|
| **Ad platforms** | Spend, impressions, clicks, campaign/adset/ad structure, creative assets; **write-back** budgets/bids/conversions | Google Ads, Meta (Facebook/Instagram) Ads, TikTok, LinkedIn, Microsoft/Bing, X/Twitter, Reddit, Snapchat, Pinterest, Apple Search Ads |
| **Web/product analytics** | Sessions, events, funnels, identity | GA4, Segment, PostHog, Amplitude, Mixpanel, RudderStack |
| **Mobile attribution (MMP)** | Installs, in-app events, SKAdNetwork | AppsFlyer, Adjust, Branch, Singular |
| **Billing / revenue** | Subscriptions, invoices, MRR, refunds, failed charges | Stripe, Chargebee, Paddle, Recurly, RevenueCat (mobile), Shopify (e-com orders) |
| **CRM / sales** | Leads, deals, pipeline, offline conversions | HubSpot, Salesforce, Pipedrive |
| **Warehouses (BYO)** | Read/write customer's own data | BigQuery, Snowflake, Redshift, Databricks |
| **Owned channels** | Email/SMS/push campaign performance joined to revenue | Klaviyo, Mailchimp, Braze, OneSignal |
| **Support / CS** | Tickets, response times, CSAT per agent (leaderboards + churn signals) | Zendesk, Intercom, Freshdesk, Crisp |
| **Feedback / surveys** | NPS, CSAT, onboarding-intent surveys → AI theme analysis | Delighted, Typeform, in-app survey SDK (Ingest API) |
| **Experimentation** | Experiment/variant/exposure results joined to revenue | GrowthBook, Optimizely, VWO (integrate, don't build) |
| **Enrichment** | Firmographics (industry, size, geo) on customers/accounts | Clearbit-style APIs + **AI classification** from domain/survey (gap 11, `14`) |
| **Affiliates / influencers** | Partner-driven acquisition cost + revenue | Impact, PartnerStack, promo-code tracking |
| **Messaging / ops** | Alerts, digests, war-room, approvals | Slack, MS Teams, email, mobile push, webhooks |

### Non-ad costs → *true* blended CAC
Ad spend alone understates CAC. A **cost ledger** (manual entry, CSV, or pushed via the Ingest API `measures` endpoint) captures agency fees/retainers, influencer flat fees, content/creative production, marketing tools, and sponsorships — allocated to channels/periods by rule. The semantic layer then exposes both `cac` (media-only) and `fully_loaded_cac`, and the optimizer (`03 §6`) can reason about them separately.

## 2. Connector architecture

Each connector implements a common contract so verticals and new platforms plug in uniformly:

```
Connector
  authenticate()        // OAuth2 / API key / service account; tokens → encrypted vault
  discoverSchema()      // accounts, campaigns, available metrics/fields
  syncIncremental(cursor)  // pull deltas since cursor; handle pagination + rate limits
  backfill(range)       // historical load
  normalize(raw) -> canonical rows   // map platform fields → canonical schema (see 04)
  capabilities()        // read-only? supports write-back? conversions API? attribution windows?
  writeAction(action)   // (optional) budget/bid/pause changes
  uploadConversions(batch)  // (optional) server-side conversion signal
```

**Design notes**
- **Incremental + idempotent**: sync by updated-time or platform report cursors; upserts keyed by natural IDs so re-runs are safe.
- **Rate limits & quotas**: per-connector token buckets in Redis; exponential backoff; respect each API's daily report quotas (Google Ads, Meta Insights are strict).
- **Schema drift**: `discoverSchema()` re-run on a schedule; new fields surfaced to admin, not silently dropped.
- **Attribution-window awareness**: each ad platform reports conversions on its own window/model — we store the platform-reported numbers *and* compute our own (see attribution in `04`), and always label which is which.
- **Historical currency/FX**: normalize spend to the tenant's reporting currency at the transaction date.

### Build vs. buy
- Use **Airbyte/Fivetran/Meltano** connectors where mature (GA4, Stripe, HubSpot, Salesforce, most warehouses) to save months.
- **Build custom** where the value is highest and off-the-shelf is thin: deep Google Ads & Meta ingestion **with write-back + Conversions API**, TikTok, LinkedIn. This is the moat.

## 3. Ad-platform specifics

Write capability is tiered per connection — the tenant chooses how much power to grant, and every tier above *Read* requires the elevated `automation.execute` scope (`08 §5`):

| Tier | Capabilities |
|---|---|
| **Read** | Reports, structure, creatives (default) |
| **Optimize** | Budgets, bid strategies/caps, pause/enable, target ROAS/CPA |
| **Manage** | Full campaign lifecycle: create/edit campaigns, ad sets/ad groups, ads; creative upload; audience create/attach (custom & lookalike from GrowthOS segments); geo/schedule/placement edits |

### Google Ads
- **Read**: Google Ads API (GAQL reports) — campaign/adgroup/ad/keyword metrics, geo, device, conversions. Service-account or OAuth per tenant.
- **Optimize**: budget amounts, bid strategies, pause/enable, target ROAS/CPA.
- **Manage**: campaign/ad-group/ad creation & editing (RSAs, PMax asset groups), keyword & negative-keyword management, audience attach, ad scheduling/geo — enabling "the AI drafts a new search campaign from your winning themes; you approve; it goes live".
- **Conversions**: **Enhanced Conversions** + **Offline Conversion Import** — upload real paid/qualified events (with hashed identifiers + GCLID) so Google optimizes toward *revenue*, not just form-fills.

### Meta (Facebook/Instagram)
- **Read**: Marketing API Insights — spend/impressions/clicks/actions by campaign/adset/ad; creative asset pull for creative intelligence.
- **Optimize**: budgets (incl. CBO/Advantage+), pause/enable, bid caps.
- **Manage**: campaign/adset/ad creation & editing, creative upload (image/video + copy variants from creative intelligence, `03 §7`), **Custom Audience / Lookalike creation from GrowthOS segments** (hashed upload from the work-lists layer — e.g., "high-LTV customers" → seed audience), placement/schedule edits.
- **Conversions**: **Conversions API (CAPI)** server-side event upload with hashed PII + `fbclid`/`fbp` — the modern, iOS14.5-resilient signal path. This directly generalizes BigBrain's "FB CPS" tracking.

All Manage-tier mutations flow through the Automation service's guardrail pipeline (`03 §8`, `06 §7`): dry-run diff → approval → execute → verify → rollback; created objects default to *paused* until a human (or explicitly-bounded autopilot policy) activates them.

### TikTok / LinkedIn / Microsoft / others
- Same contract: Insights read + Events API/Conversions API write-back where available. LinkedIn/Microsoft are important for B2B verticals.

## 4. Conversion send-back (server-side, first-party)

A first-class subsystem, because it's where modern performance lives post-privacy-changes:

1. Funnel/revenue events (signup, qualified lead, paid, expansion) land in the warehouse with the original click IDs (GCLID/FBCLID/TTCLID) captured at entry.
2. A **conversion mapping** UI (admin) lets each tenant map their canonical events → each platform's conversion actions, with value + dedup keys.
3. Automation service batches and uploads via each platform's server-side API (Enhanced Conversions, CAPI, TikTok Events API), hashing PII client-agnostically.
4. Dedup with client-side pixels via event IDs; report match rates back in the admin console.

This turns GrowthOS from a *reporting* tool into a *performance-improving* tool — the ad platforms optimize better because they now see true downstream value.

## 5. Identity capture at the edge

- Lightweight **GrowthOS tag / SDK** (web + mobile + server) captures first-party click IDs, UTMs, landing page, and consent state at session start and persists them to the eventual signup/purchase.
- Consent-mode aware (GDPR/CCPA): if consent absent, fall back to modeled/aggregated signals; never send PII.
- Server-side option (via GA4 Measurement Protocol / server tag) for tenants who want no client PII.

## 6. Onboarding flow (per tenant)

1. Pick **vertical template** (SaaS / e-com / mobile / lead-gen / marketplace) → seeds funnel + KPI defaults.
2. Connect ad platforms (OAuth), billing, analytics, CRM (guided, "connect at least: 1 ad + 1 revenue source").
3. Auto-discover accounts/campaigns; map spend + revenue; AI proposes the canonical funnel mapping for review.
4. Backfill (typically 13–24 months) runs in the background; dashboards populate progressively.
5. Set goals + war-room; invite team; configure alerts.

## 7. Reliability & observability of ingestion

- Per-connector **health page** (last sync, rows, freshness, error rate) in admin.
- Data-quality tests (dbt tests + expectations): row counts, spend ≥ 0, no duplicate invoices, spend-vs-clicks sanity.
- Freshness SLAs surfaced as a badge on every dashboard tile ("data as of 2h ago").
- Dead-letter + replay for failed batches; alerting when a connector silently returns zero rows.
