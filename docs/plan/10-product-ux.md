# 10 — Product & UX Specification

How the platform actually looks and feels. BigBrain won hearts with a *war-room TV*; GrowthOS must win daily work too. Design language: clean, data-dense but calm, dark-mode-first for TV/war-room, full RTL support.

## 1. Information architecture (app navigation)

```
Org switcher ▾ / Project switcher ▾ / Environment badge (prod|staging) / ⌘K omnisearch
                                     (customers, campaigns, metrics, dashboards — gap 15 in 14)
├── Home            — "Daily Brief": AI narrative + top KPIs + anomalies + approvals waiting
├── Dashboards      — grid of boards (default packs + custom); TV mode per board
├── Analyst (AI)    — chat + history; every answer → pin-to-dashboard
├── Metrics         — semantic-layer catalog: browse/search/define; lineage view
├── Funnels & Cohorts — funnel explorer, cohort matrix, retention curves
├── Revenue         — MRR movements, collections, orders, product-type mix (09)
├── Marketing       — channels/campaigns/creatives, attribution comparison, budget optimizer
├── Customers       — searchable customer 360 (journey, orders, subs, LTV, churn risk)
├── Lists & Feeds   — live record feeds (recent paying/churn/failed) + saved segments as
│                     work lists (owner, status, CRM sync, AI-suggested lists) — gap 5 in 14
├── Goals & War-room — goal thermometers, live win feed, leaderboards, celebrations config
├── Automations     — recommendations inbox, action history, guardrails, approvals
├── Alerts          — anomaly feed, subscriptions, routing
└── Admin           — sources, keys, schema registry, plugins, members & roles, audit, billing
```

## 2. Key screens (v1 definitions)

### 2.1 Home — "Daily Brief"
The first screen every morning; replaces walking past the office TV:
- AI-written summary (3–6 bullets): what changed, why, what to do (from `03 §3`).
- Headline KPI strip (configurable per role — CMO sees CAC/ROAS; CEO sees MRR/runway).
- Anomaly cards with one-click "investigate in Analyst".
- Pending approvals (agent actions) with inline approve/reject.

### 2.2 Dashboard & tile system
- Grid layout, drag-drop; tile types: line/bar/area, big-number + spark, cohort heatmap, funnel, table, pie/donut, map, **AI-note tile** (auto-refreshing narrative), iframe/plugin panel (`08 §4`).
- Every tile: metric picker from the semantic layer (never free-SQL by default), period compare, dimension breakdown, drill-down to underlying definition (lineage), freshness badge, "explain this" AI button.
- Table tiles: sortable columns with show/hide toggles (persisted per user), **inline editing** for editable cells (targets, cost-ledger entries) with audit — the x-editable pattern BigBrain used everywhere (gap 15).
- Board-level: date range, global filters (channel/geo/product-type), sharing (role-scoped link), **TV mode**, scheduled snapshot to Slack/email.

### 2.3 War-room / TV mode (the BigBrain soul, modernized)
- Full-screen rotating boards; huge typography; dark theme.
- **Live win feed**: subscription started, big order, yearly upgrade — slide in with configurable confetti/sound per win type (per `04 §6`); owner avatar ("closed by X") and streaks.
- Goal thermometers with AI pace projection ("on track for Oct 12").
- Works on any TV/browser via a device-pairing code (no login on the TV itself).

### 2.4 AI Analyst
- Chat surface with: suggested questions per role, charts rendered inline, "show the query" expander (metric+filters used), pin-answer-to-dashboard, share-to-Slack.
- Conversation memory per project; cross-project questions only when the user has scope (`08 §5`).

### 2.5 Customer 360
- Timeline: touchpoints → funnel events → orders (by product type) → subscription lifecycle → support signals.
- Right rail: LTV (realized + predicted), churn risk, next-best-action (from `03 §7`).
- PII masked unless the viewer holds `pii.read`.

### 2.6 Onboarding wizard (time-to-value < 30 min)
1. Create org → project → pick vertical/metric pack (or "custom/hybrid").
2. Connect first sources — big tiles: Google/Meta/Stripe/Shopify/GA4 or "Push your own data" (shows a ready-to-copy curl + API key).
3. AI proposes funnel/step mapping from discovered data → user confirms.
4. Instant "starter board" renders with whatever's already synced; backfill continues in background with a progress banner.
5. Invite team + set first goal + turn on the war-room (moment of delight — test the confetti).

## 3. Notifications & digest UX

- Channels: in-app inbox, email, Slack/Teams, mobile push, webhooks-out.
- **Digest**: daily/weekly per user, AI-personalized to their role and watched metrics.
- Alert cards always contain: what moved, expected vs. actual, likely cause, deep link, feedback buttons ("useful / not useful" → trains suppression, `03 §4`).
- Approval requests (money-moving) render as actionable cards in Slack and mobile.

## 4. Design system & quality bars

- Component library on top of shadcn/ui + tokens; charts standardized (one library, one palette, colorblind-safe).
- **i18n/RTL from day one**; all strings in translation files (per house rules — no hard-coded UI text, no Hebrew in code files; Hebrew lives only in translation resources).
- Accessibility WCAG 2.1 AA; keyboard-complete; reduced-motion mode (confetti off).
- Performance: dashboard first-paint < 2s (skeletons + cached metrics); TV mode steady-state 60fps.
- Empty/error states designed: connector down → stale badge + last-good data, never a blank board (`01 §6`).

## 5. Mobile app (Phase 5, `07`)

- Read-first: Daily Brief, KPI watchlist, goal progress, win-feed notifications.
- Act: approve/reject automations, acknowledge alerts, ask the Analyst.
- Widgets (iOS/Android home screen) for 1–2 pinned KPIs.
