# 03 — AI Capabilities

This is the layer that makes GrowthOS a **step change** over BigBrain, not a re-skin. BigBrain showed numbers; GrowthOS explains, predicts, and acts.

## 1. Capability map

| # | Capability | What the user gets | Core tech |
|---|---|---|---|
| 1 | **AI Analyst (NL query)** | Ask "why did CAC rise in DE last week?" → chart + written answer grounded in real data | LLM + tool-calling over the Metrics API/semantic layer |
| 2 | **Auto-insights & narratives** | Every dashboard & daily digest gets a written "what changed and why" | LLM over metric deltas + segment decomposition |
| 3 | **Anomaly detection** | Automatic alerts on any metric moving abnormally, with likely cause | Statistical + ML monitors + LLM root-cause |
| 4 | **Forecasting** | Month-end MRR, spend pacing, cohort payback, churn/LTV projections | Time-series + gradient boosting |
| 5 | **Budget / bid optimizer** | Recommended (or auto) reallocation across channels & campaigns | Optimization + marketing-mix modeling |
| 6 | **Creative intelligence** | Score creatives, cluster winning patterns, draft new copy/variants | Vision + LLM |
| 7 | **Churn & expansion radar** | Accounts likely to churn / ready to upsell, with recommended plays | Propensity models + LLM playbooks |
| 8 | **Agentic actions** | Agent proposes & (on approval) executes changes back into platforms | LLM agent + Automation service + guardrails |
| 9 | **Semantic-model authoring** | Describe a metric in words → validated metric definition | LLM → SQL/semantic compile + tests |
| 10 | **Report/dashboard generation** | "Build me a paid-social weekly review" → assembled dashboard | LLM + component schema |

## 2. AI Analyst — natural-language analytics

**The core interaction.** A chat + inline surface where anyone (marketer, exec, CS) asks questions in plain language and gets a grounded, cited answer.

The same tool surface is exposed outward as a first-party **MCP server** (`12 §6`) — users can talk to their GrowthOS project from Claude Desktop/claude.ai/Claude Code or wire it into their own agents, with identical permission scoping and the propose→approve safety model.

**How it stays correct (no hallucinated numbers):**
- The LLM never invents figures. It is given **tools**, not raw table access:
  - `list_metrics()`, `list_dimensions()`, `describe_metric(name)`
  - `query_metric(metric, dimensions[], filters[], time_range, grain)`
  - `compare_periods(...)`, `decompose(metric, by_dimension)` (auto contribution analysis)
  - `run_forecast(metric, horizon)`
- It plans a query → calls the Metrics API → the **numbers come from the warehouse**, and the LLM only *narrates and interprets* them.
- Answers cite the exact metric definitions and filters used, with a "view/edit query" affordance and a chart. Every answer is reproducible.
- Uses Claude with tool-calling (see `claude-api` reference). Cheap models (Haiku) for routing/classification, strong models (Opus) for multi-step reasoning and agents.

**Example**
> **User:** Why did our blended CAC go up 22% last week?
> **Analyst:** Blended CAC rose from \$180 → \$220 (+22%). Decomposing: 78% of the increase came from **Meta** (CPS +31% while conversion-rate held), driven by campaign *"Retargeting-Broad"* whose CPM spiked +40% Tue–Thu. Google CAC was flat. New-signup→paid conversion was unchanged, so this is a **cost problem, not a quality problem**. Suggested action: cap or pause *Retargeting-Broad*; reallocate ~\$4k/day to *Search-Brand* (CAC \$120). [View query] [Create action]

## 3. Auto-insights & narrative dashboards

- Nightly job scans every headline metric per tenant, computes deltas vs. expected (from forecast, not just last period), decomposes by top dimensions, and writes a ranked list of **insights** ("Signups from TikTok up 3× after creative refresh; payback still unproven — watch cohort").
- Each dashboard tile can expand to an AI "explain this" note.
- Digest delivered to Slack/email each morning — the modern version of walking past BigBrain's TV.
- **Weekly "growth review" auto-report**: an AI-composed, meeting-ready document (metrics vs. goals, wins, concerns, decisions needed, experiment results) — replaces the analyst-hours spent assembling Monday-morning decks; exportable/shareable per role.

## 4. Anomaly detection

- Every metric gets a monitor: seasonal baseline (day-of-week/holiday aware) + robust z-score / Prophet residual / control charts. ML propensity where enough history exists.
- On trigger: severity scored, root-cause decomposition run, LLM writes the alert, routed to the right owner (channel owner, CS rep) with a one-click "investigate in Analyst".
- Avoids alert fatigue: dedup, grouping, and a learned suppression from user "not useful" feedback.

## 5. Forecasting & predictive

- **Revenue/MRR**: month-end and quarter-end projection with confidence bands; new vs. expansion vs. churn decomposition (mirrors BigBrain's MRR pyramid, now forward-looking).
- **Spend pacing**: are we on track to hit the monthly budget/target? auto-flag over/under-pacing.
- **Cohort payback**: projected months-to-recover-CAC per channel/campaign; kill criteria surfaced early.
- **Churn/LTV propensity**: per-account risk & predicted LTV, feeding the CS war-room and expansion radar.

## 6. Budget & bid optimizer (marketing-mix + campaign-level)

- **Top-down**: light marketing-mix model estimates diminishing returns per channel → recommends channel-level budget split for a target CAC/ROAS or a fixed budget.
- **Bottom-up**: campaign/adset-level reallocation from losers to winners given payback + saturation.
- Outputs **recommendations** with expected impact and confidence. Optionally executed by the agent (Section 8) with caps and human approval.
- Honest about causality: recommendations flag when they're correlational and suggest a holdout/geo-test to confirm (incrementality testing built in).

## 7. Creative intelligence

- Pull creative assets + performance from Meta/TikTok/Google.
- **Vision model** tags each creative (format, hook, has-face, text density, color, CTA, theme) → find which attributes drive CTR/CVR/CAC.
- **Generate**: draft new headlines/primary text/variations for winning concepts (brand-voice-conditioned), and storyboard prompts for new creative. Human-in-the-loop before anything ships.
- Fatigue detection: flag creatives whose frequency is up and CTR decaying.

## 8. Agentic optimization (propose → approve → act)

An agent runtime that turns insights into changes, safely:

- **Triggers**: schedule, anomaly, or user ask ("keep CAC under \$150 this week").
- **Plan**: agent uses read tools (Analyst) + optimizer to draft an action set (pause X, shift \$Y, raise bid Z, upload conversions).
- **Guardrails**: per-tenant policy — max daily budget change %, protected campaigns, spend ceilings, business hours, blast-radius limits. Dry-run diff shown first.
- **Approval**: default **human-approves** in Slack/app; "autopilot" mode allowed only within tight bounds and fully logged.
- **Actuate & verify**: Automation service writes to platforms, then the agent monitors the result and reports back (and can auto-rollback if a metric worsens past a threshold).
- **Every action is an audit record** (who/what/why/before/after) — see `06`.

## 9. Semantic-model & dashboard authoring by AI

- **Metric authoring**: "Define *Qualified CAC* = ad spend / number of leads that reached stage 'SQL'." → LLM drafts the semantic definition, compiles to SQL, runs validation tests, shows sample output for approval.
- **Dashboard generation**: "Create a weekly paid-social review for the CMO." → LLM assembles tiles from existing metrics into a layout schema; user tweaks.
- This is what lets **non-engineers extend the system** — the thing BigBrain could never do (every report was hand-coded).

## 10. Safety, cost & evaluation

- **Grounding**: numbers only ever come from the Metrics API; the LLM is prompted and structurally constrained to cite/query, never fabricate.
- **Evaluation harness**: golden-question set per vertical; regression-test NL→query accuracy on every model/prompt change.
- **User-facing calibration views**: every predictive score we ship (intent, conversion, ROI-N, churn risk) gets a predicted-vs-actual chart in the product — BigBrain did this for its intent model ("Conversion Prediction Correlation"); trust comes from showing our model's track record, not asserting it.
- **Cost control**: model routing (Haiku for classification/tagging, Opus for reasoning/agents), aggressive caching of query results, and token budgeting per tenant/plan.
- **Privacy**: prompts to LLMs carry aggregated metrics and schema, **not raw PII**; PII stays in the warehouse. Per-tenant data isolation preserved in all AI calls.
- **Human-in-the-loop by default** for anything that spends money or changes a live campaign.
