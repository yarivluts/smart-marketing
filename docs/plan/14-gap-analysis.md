# 14 — Gap Analysis: BigBrain Features Our Plan Was Missing

A second, deeper pass over the BigBrain HTML (full nav tree, company-goals board, customer-success board, KPI war-room internals) surfaced features the plan didn't cover. Each gap below states what BigBrain had, why it matters, and how we adopt it. Cross-references updated in the affected docs.

## Gap 1 — NPS & qualitative feedback (MISSING ENTIRELY) 🔴
**BigBrain had:** `nps_answers` (raw NPS data), `nps_answers/analysis`, and an **NPS target on the company-goals board** (`id="nps"`).
**Why it matters:** quantitative funnels tell *what*, NPS/feedback tells *why*. BigBrain treated NPS as a first-class company goal.
**Adopt:**
- NPS/CSAT/survey responses as a registered event type (`survey_response`) in the core schemas; NPS metric pack (score, trend, by segment/plan/channel).
- Connectors: Delighted, Typeform, in-app survey SDK (via Ingest API); **AI text analysis** of open-ended answers — theme clustering, sentiment, "top complaint this month" in the daily digest, correlation of NPS themes with churn cohorts (`03`).
- NPS as a goal type on the goals board.
**Lands in:** `02` (connector row), `04 §3` (metrics), `03 §3` (AI theme analysis), Phase 2 (`07`).

## Gap 2 — Engagement depth: DAU/MAU, L28, active-users explorer 🔴
**BigBrain had:** `active_users/active` (MAU/DAU activity), `reports/l28_histogram` (distribution of days-active-in-last-28 — an engagement *depth* histogram, not just a count), behavior cohorts.
**Why it matters:** L28 histograms are one of the strongest PMF/health visuals; our metric catalog stopped at "weekly retention".
**Adopt:** `dau`, `wau`, `mau`, `dau_mau_ratio` (stickiness), **LN histograms** (configurable N), power-user curve — added to the engagement pack; histogram tile type added to the dashboard framework.
**Lands in:** `04 §3`, `10 §2.2` (tile type), Phase 1–2.

## Gap 3 — Experimentation & promo surfaces (A/B) 🟡
**BigBrain had:** `reports/banners` + landing-page reports — measuring in-product/site promo banners and LP variants.
**Why it matters:** we measure campaigns but the plan had no notion of *experiment* — variant, exposure, significance.
**Adopt:** lightweight **experiment model** (`experiment`, `variant`, `exposure` events in core schemas) + results view with significance testing; integrates external tools (GrowthBook/Optimizely/VWO) via connectors rather than building a full flag system. AI suggests "this LP variant wins with 97% probability — roll out".
**Lands in:** `04 §1` (schemas), `03` (AI verdicts), `02` (connector row), Phase 4.

## Gap 4 — Signup intent & lead-quality scoring 🟡
**BigBrain had:** `reports/intent_breakdown` ("Intent Model Breakdown") + `survey_account_size` ("Upgrade Potential") — classifying signups by intent/size from onboarding surveys and behavior, and an **intent target on the goals board**.
**Why it matters:** volume metrics hide quality shifts; BigBrain literally set goals on signup *intent* mix. Our AI plan covered churn/expansion propensity but not **at-signup quality scoring**.
**Adopt:** onboarding-survey ingestion + **AI intent/quality score at signup** (survey + firmographic + behavioral features); "quality-adjusted CPS/CAC" metrics; alert when a channel's intent mix degrades even if CPS looks fine (classic Meta failure mode).
**Lands in:** `03 §7` (extended), `04 §3`, Phase 2–3.

## Gap 5 — Operational record-level feeds & work lists 🔴
**BigBrain had:** a whole layer of *record-level* screens: `recent_paying`, `recent_churn`, `recent_upgrades(+failed)`, `last_demos`, and notably **`accounts/paying_no_demo`** — an actionable work list ("paying accounts that never got a demo → go talk to them").
**Why it matters:** our plan was aggregate-heavy (dashboards, metrics). Teams *act* on lists of records. This is the bridge from analytics to daily ops.
**Adopt:**
- **Live feeds**: recent payments / churns / failed charges / big orders as browsable, filterable record streams (drill into Customer 360).
- **Saved segments as work lists**: any segment definition (e.g., "paying, no demo, MRR > $200") becomes a live list with owner assignment, status ticking, and export/sync to CRM (action plugin). AI proposes new high-value lists ("14 yearly subs renewing in 30 days with falling usage").
**Lands in:** `10` (new screen), `04 §6`, `13` (new tasks), Phase 2.

## Gap 6 — Customer-support analytics & team leaderboards 🟡
**BigBrain had:** a full CS dashboard: per-agent **leaderboard** (photo, open tickets, tickets-closed-today, reply count, satisfaction), first-response vs. all-replies time, today/7-day views, and a **`good_review_popup`** — a celebration when a good review lands.
**Why it matters:** our plan mentioned a CS board in one line; BigBrain treated support performance as a core company screen, with the same emotional layer as sales.
**Adopt:**
- **Support connectors**: Zendesk, Intercom, Freshdesk, Crisp → tickets/replies/CSAT schemas.
- CS metric pack: first-response time, resolution time, tickets closed, CSAT/agent, open backlog.
- **Team & person entities** (`dim_team_member`, photo, role) powering leaderboards in *any* domain (CS agents, sales reps, account managers — BigBrain had per-manager celebration sounds); win rules can attribute to a person.
- Good-review / CSAT celebration as a war-room win type.
**Lands in:** `02` (connector rows), `04 §6`, `05` (CS pack), Phase 4.

## Gap 7 — Event taxonomy governance & tracking-plan health 🟡
**BigBrain had:** `events/management`, `events_view/main`, `events_count_track` — dedicated screens for managing the event taxonomy and watching per-event volumes.
**Why it matters:** our Schema Registry stores definitions but the plan lacked **per-event operational health**: is `order_completed` suddenly down 40%? Did a release break tracking?
**Adopt:** per-event volume monitoring with anomaly detection ("tracking broke" alerts — distinct from business anomalies), unused/undocumented-event reports, tracking-plan export, and event-volume sparklines in the Schema Registry admin.
**Lands in:** `06 §1`, `08 §3.1`, Phase 1 (cheap — reuses the anomaly engine).

## Gap 8 — Goals on quality/efficiency metrics, with direction & rhythm 🟢
**BigBrain had:** the company-goals board tracked not just revenue but **signup_cost** (lower-is-better), **conversion, desktop share, intent, NPS** — and split **Work Week vs. Weekend** targets with red/green pace bars.
**Why it matters:** our goal model implicitly assumed "bigger number = good, one target per period".
**Adopt:** goal model supports **direction** (maximize/minimize/stay-in-range), **calendar rhythm** (workweek/weekend/holiday-aware targets — we already have the calendar in `04 §7`), and mixed goal boards (revenue + quality side by side).
**Lands in:** `13` task E12.1 (extended), Phase 1.

## Gap 9 — Sales-assist workflows (demos pipeline) 🟢
**BigBrain had:** `sales/manage`, `stats/last_demos`, upgrade-failure feeds — light sales-ops tooling inside the analytics platform.
**Why it matters:** for the SaaS/B2B verticals, the handoff moment (demo booked/held/no-show) is a funnel step worth first-class treatment.
**Adopt:** demo/meeting events in the SaaS pack (via calendar/CRM connectors), "recent demos" feed, and the `paying_no_demo`-style lists via Gap 5's segments. We do **not** build a CRM — we read/write to one.
**Lands in:** `05` (SaaS pack), Phase 4 (with lead-gen vertical).

## Priority summary

| Gap | Severity | Phase | Cheap because |
|---|---|---|---|
| 5. Record feeds & work lists | 🔴 High | 2 | Reuses ingest + Customer 360 |
| 1. NPS & feedback + AI themes | 🔴 High | 2 | Survey = just another event type |
| 2. DAU/MAU/L28 engagement pack | 🔴 High | 1–2 | Pure semantic-layer metrics |
| 7. Tracking-plan health | 🟡 Med | 1 | Reuses anomaly engine |
| 8. Goal direction & rhythm | 🟢 Low | 1 | Small model change, do it early |
| 4. Intent/quality scoring | 🟡 Med | 2–3 | Needs AI layer online |
| 6. Support analytics + people layer | 🟡 Med | 4 | New connectors |
| 3. Experimentation | 🟡 Med | 4 | Integrate, don't build |
| 9. Sales-assist | 🟢 Low | 4 | Rides on Gap 5 + CRM connectors |
| 10. Churn reasons + AI taxonomy | 🔴 High | 2 | One schema + LLM clustering |
| 12. ROI-Nd, per-campaign targets, calibration | 🟡 Med | 2–3 | Semantic-layer family + small UI |
| 15. Omnisearch, inline edit, billing feeds | 🟢 Low | 2 | UX ergonomics |
| 11. Firmographic enrichment | 🟡 Med | 3–4 | Connector + AI classifier |
| 14. Reactivation & trial widgets | 🟢 Low | 1–2 | Events already modeled |
| 13. Rep collections ledger | 🟢 Low | 4 | Rides on people layer |

---

# Second pass — 71 saved report pages examined (the `bigbrain/` subfolders)

A full sweep of the saved report bodies (`MRR/`, `billing/`, `churn/`, `dashboard/`, `engagement/`, `marketing/`, `premium/`, `sales/`, `upgrades/` — 71 HTML pages) surfaced six more gaps:

## Gap 10 — Churn-reason capture, taxonomy & AI categorization 🔴
**BigBrain had:** `recent_churn` listed every churned account with **Churn Reason, Churn Text (free text), Category** — they captured *why* customers left, categorized it, and browsed it per record.
**Adopt:** cancellation-reason schema (`churn_reason` structured + free text) captured from cancel flows/exit surveys; **AI clustering of free-text reasons into a live taxonomy**; churn-reason breakdown joined to plan/channel/cohort ("reason X is 3× more common in accounts from TikTok"); reasons feed the churn-radar playbooks (`03 §7`).
**Lands in:** `04 §3`, `09 §2` (subscription events carry reason), Phase 2. Cheap and high-value.

## Gap 11 — Firmographic enrichment & customer-base composition 🟡
**BigBrain had:** paying-accounts distribution **by country, plan size, and industry category (Main Category / Top Sub Categories)** — with toggles for **# accounts vs. $ value** and **new vs. total**. Accounts were enriched with an industry classification.
**Adopt:** enrichment pipeline (Clearbit-style connector and/or **AI classification** from domain/answers) adding industry/size/geo attributes to `dim_customer`; composition dashboards weighted by count or value; composition-shift alerts ("this month's new MRR skews SMB — LTV impact").
**Lands in:** `02` (enrichment connector row), `04 §1` (customer attributes), Phase 3–4.

## Gap 12 — Fixed-window payback (ROI-40), per-campaign targets & prediction calibration 🟡
**BigBrain had:** Campaign Monitoring tracked per campaign: **Coll. 40(d)** (revenue collected within 40 days), **ROI(40)**, **Pred ROI(40)** and **% Predicted Conv** (a per-campaign prediction!), plus **Target SC** (a signup-cost target *per campaign*, inline-editable), and toggleable **soft-signup** (micro-conversion) columns. The intent-model page even had a **"Conversion Prediction Correlation"** view — they validated their model against actuals.
**Adopt:**
- **`roi_nd` / `collection_nd` metric family** (configurable N-day window) as the operational early-payback standard — faster feedback than full cohort payback.
- **Per-entity targets**: targets attachable to campaigns/channels (not only global goals), inline-editable, driving red/green in campaign tables and optimizer constraints.
- **Prediction-calibration views**: predicted-vs-actual charts for every AI score we ship (intent, conv, ROI-N) — trust through transparency (extends `03 §10` evaluation into user-facing UI).
**Lands in:** `04 §2`, `03 §5–6, §10`, Phase 2–3.

## Gap 13 — Rep-attributed collections ledger ("Get them Moneys") 🟢
**BigBrain had:** a sales screen listing **Account Manager, Company, plan From→To, How, When, Collection** with a weekly collection total — revenue attributed to the person who drove it, inline-editable.
**Adopt:** activity ledger on the people layer (gap 6): attribute upgrades/saves/expansions to team members (auto from CRM/billing + manual edit), weekly/monthly collection per rep, leaderboard + war-room integration. Not a commission system — an attribution view others can export.
**Lands in:** `04 §6` people layer, Phase 4.

## Gap 14 — War-room completeness: reactivation & trial pipeline 🟢
**BigBrain had:** the KPI war-room tracked **resurrected companies** (churned → returned) and **on-trial companies** as headline boxes, alongside heart/gift celebration variants.
**Adopt:** `reactivation` as a first-class metric + win type (we had the event in `09 §2` but not the KPI/celebration); **trial-pipeline widget** (in trial now → converting at X%); celebration variety per win type.
**Lands in:** `04 §6`, `13` E12.2 win catalog, Phase 1–2 (trivial on top of existing model).

## Gap 15 — Operational ergonomics 🟢
**BigBrain had, everywhere:** a **global "Search Account" box in the navbar** (omnisearch from any screen), **inline editing** (x-editable) of targets/values directly in report tables, sortable columns with show/hide toggles, and dedicated **billing-ops failure feeds** (`new_charges`, `failed_charge`, `contract_change_failure`, `recurring_charge_failures`).
**Adopt:** global omnisearch (customers, campaigns, metrics, dashboards — cmd-K); inline editing for targets/cost-ledger cells; column show/hide + sort persistence in table tiles; billing-failure feed types join the gap-5 record feeds (dunning ops).
**Lands in:** `10 §1–2` (omnisearch, table tiles), gap-5 feeds, Phase 2.

## New backlog items (append to `13`)
- **E11.5** Engagement pack: `dau/wau/mau`, stickiness, L28 histogram + histogram tile *(3d, Phase 1, Gap 2)*
- **E12.1b** Goal model: direction (min/max/range) + workweek/weekend rhythm *(1d, Phase 1, Gap 8)*
- **E3.6** Per-event volume sparklines + "tracking broke" anomaly alerts in Schema Registry admin *(2d, Phase 1, Gap 7)*
- **E14.x (Phase 2 epic — Ops Lists & Feeds):** live record feeds (payments/churn/failed), saved segments with owners + statuses, CRM-sync action plugin, AI-suggested lists *(≈10d, Gaps 5+9)*
- **E15.x (Phase 2 epic — Feedback & NPS):** survey ingestion (connector + in-app SDK), NPS metrics + goal type, AI theme clustering into digest *(≈8d, Gap 1)*
- **E16.x (Phase 2–3 — Intent scoring):** onboarding-survey schema, at-signup quality score, quality-adjusted CAC/CPS + mix-shift alerts *(≈8d, Gap 4)*
- **E12.2b** Win catalog: reactivation + trial-conversion win types; trial-pipeline war-room widget *(2d, Phase 1–2, Gap 14)*
- **E14.y** Churn-reason capture schema + AI reason clustering + breakdown report *(4d, Phase 2, Gap 10)*
- **E14.z** Billing-ops feeds: new charges / failed charges / recurring-failure lists with dunning status *(2d, Phase 2, Gaps 5+15)*
- **E17.x (Phase 2 — Ergonomics):** global omnisearch (cmd-K), inline target/value editing in tables, column sort/show-hide persistence *(≈6d, Gap 15)*
- **E18.x (Phase 2–3 — Campaign ops):** `roi_nd`/`collection_nd` metric family, per-campaign editable targets, predicted-vs-actual calibration views *(≈7d, Gap 12)*
- **E19.x (Phase 3–4 — Enrichment):** firmographic enrichment connector + AI industry classification, composition dashboards (# vs $), composition-shift alerts *(≈6d, Gap 11)*
- **E20.x (Phase 4 — Rep ledger):** activity ledger, rep-attributed collections, leaderboards *(≈5d, Gap 13)*
