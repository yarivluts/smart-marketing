# 12 — API Reference Sketch (Ingest, Metrics, Webhooks, Plugin Manifest)

Concrete contracts so external systems can integrate on day one. Full OpenAPI specs derive from these sketches.

## 1. Auth

```
Authorization: Bearer gos_live_<project-scoped key>     # or gos_test_ for staging env
X-GrowthOS-Signature: sha256=<HMAC of body>             # optional signed mode
```
- Keys are minted per **project + environment** with explicit scopes (`ingest:write`, `metrics:read`, …) — see `08 §5`.
- Rate limits per key; `429` + `Retry-After`; batch limits documented per endpoint.

## 2. Ingest API (push)

### 2.1 Events
```http
POST /v1/ingest/events
{
  "batch": [
    {
      "event_id": "ord_5001-evt",            // client id → idempotency/dedup
      "event": "order_completed",             // must exist in Schema Registry (or policy=auto_evolve)
      "ts": "2026-07-03T10:15:00Z",
      "identities": { "user_id": "u_123", "email_hash": "sha256:..." },
      "context":   { "click_ids": {"gclid": "..."}, "utm": {"source": "google"}, "consent": "granted" },
      "properties": { "order_id": "ord_5001", "net": 349.0, "currency": "ILS" }
    }
  ]
}
→ 202 { "batch_id": "b_789", "accepted": 1, "quarantined": 0 }
GET /v1/ingest/batches/{batch_id}   → per-record validation results
```

### 2.2 Entities (upserts) & Measures (aggregates)
```http
POST /v1/ingest/entities  { "type": "product", "records": [{ "id": "sku_1", "attributes": {...} }] }
POST /v1/ingest/measures  { "records": [{ "measure": "ad_spend", "ts": "2026-07-02",
                             "dimensions": {"channel":"meta","campaign_id":"c_9"},
                             "value": 1250.5, "currency": "USD" }] }
```

### 2.3 Commerce convenience endpoints (sugar over events, per `09`)
```http
POST /v1/ingest/orders          // order + lines (mixed product types) in one call
POST /v1/ingest/subscriptions   // lifecycle events: trial_start|convert|renew|cancel|payment_failed...
POST /v1/ingest/refunds
```

### 2.4 Inbound webhooks (zero-code path)
```
POST /v1/hooks/{project}/{hook_id}     ← point any SaaS webhook here
```
Payloads are stored raw, then transformed by a saved **mapping** (UI/AI-authored, `08 §3.2`). Unmapped payloads sit in a review queue.

## 3. Metrics API (read)

```http
POST /v1/metrics/query
{
  "metric": "cac",                          // or ["ad_spend","new_paying"]
  "dimensions": ["channel"],
  "filters": [{ "field": "geo", "op": "=", "value": "IL" }],
  "time": { "start": "2026-06-01", "end": "2026-06-30", "grain": "week",
            "compare": "previous_period" },
  "attribution_model": "data_driven"        // optional; default per project config
}
→ 200 { "series": [...], "definition_ref": "metric:cac@v3", "freshness": "2026-07-03T08:00Z" }
```
Also: `GET /v1/metrics` (catalog), `GET /v1/metrics/{name}` (definition + lineage), `POST /v1/cohorts/query`, `POST /v1/funnels/query`. These are exactly the tools the AI Analyst uses (`03 §2`) — one contract for humans, machines, and the AI.

## 4. Outbound webhooks & events (subscribe)

```
POST /v1/subscriptions  { "events": ["anomaly.detected","goal.reached","automation.proposed",
                          "automation.executed","win.recorded","sync.failed"],
                          "url": "https://...", "secret": "..." }
```
Delivery: signed (HMAC), retried with backoff, dead-lettered + replayable from admin. This is how customers plug GrowthOS *into their own* systems — the reverse direction of ingest.

## 5. Plugin manifest (`plugin.yaml`, per `08 §4`)

```yaml
id: com.example.shopify-pack
version: 1.2.0
type: source            # source | mapping | transform | metric_pack | action | ai_tool | panel
display_name: Shopify Commerce Pack
scopes: [ingest:write, schema:write]        # least-privilege, user-approved at install
config_schema:                              # rendered as install form
  shop_domain: { type: string, required: true }
registers:
  entities: [product, order]
  events: [order_completed, order_refunded]
  metrics: [aov, repeat_rate]               # metric packs only
endpoints:
  sync: ./sync.ts        # source: incremental pull
  action: ./act.ts       # action plugins: execute/rollback handlers
```

## 6. MCP server — talk to the platform in natural language

GrowthOS ships a first-party **MCP (Model Context Protocol) server**, so any MCP client — Claude Desktop, Claude Code, claude.ai connectors, IDEs, custom agents — can converse with the platform and operate it in natural language. This is the same capability as the built-in AI Analyst (`03 §2`), exposed *outward*.

### 6.1 Transport & auth
- Remote MCP over Streamable HTTP: `https://mcp.growthos.app/{org}/{project}` — **one server scope per project** (isolation property `08 §5.6` holds: a token bound to project A cannot see project B, cannot enumerate other projects).
- Auth: OAuth 2.1 flow for interactive clients, or a scoped API key (`mcp:read` / `mcp:act`) for headless agents. All calls run through the same policy engine as the web app — MCP grants nothing the underlying principal doesn't have.

### 6.2 Tool surface (mirrors the public APIs)
| Tool | Wraps | Notes |
|---|---|---|
| `list_metrics`, `describe_metric` | Metrics catalog | definitions + lineage |
| `query_metric`, `compare_periods`, `decompose` | `POST /v1/metrics/query` | grounded numbers, never generated |
| `query_funnel`, `query_cohort` | funnel/cohort APIs | |
| `search_customers`, `get_customer` | Customer 360 | PII masked unless `pii.read` |
| `list_segments`, `create_segment` | work lists (gap 5) | |
| `get_goals`, `create_goal` | goals API | direction/rhythm aware |
| `list_insights`, `get_anomalies` | insight feed | |
| `propose_action` | Automation service | returns a dry-run diff; **never executes directly** |
| `approve_action` | approval workflow | requires `automation.approve`; guardrails still apply |
| `ingest_events` (optional, off by default) | Ingest API | lets agent-builders push data conversationally |

Resources: metric definitions, dashboard snapshots, schema registry docs — exposed as MCP resources for client-side context. Prompts: canned starters ("weekly review", "why did CAC move").

### 6.3 Safety model
- Read tools ↔ act tools are separate scopes; `propose_action` → `approve_action` preserves the human-in-the-loop even when the human is chatting from Claude Desktop.
- Rate/token budgets per MCP key; every tool call lands in the audit log with the principal + client identity.
- The isolation test suite (`08 §5.6`) covers the MCP surface like any other API.

**Why this matters:** it turns GrowthOS into infrastructure — customers wire it into their own agents/workflows ("every Monday my agent pulls last week's CAC and drafts the budget memo"), and it makes the product usable from wherever the user already works.

## 7. Versioning & stability

- URL-versioned (`/v1`), additive changes only within a version; deprecations announced ≥ 6 months with usage-based nudges (we can see who still calls old fields).
- Sandbox environment + fake-data generator so integrators can build before real data flows.
- Public status page + changelog; SDKs (JS/Node/Python/PHP) generated from the OpenAPI spec and kept in CI.
