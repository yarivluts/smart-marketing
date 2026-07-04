# 08 — Generic Platform Core: Multi-Project, Permissions & Pluggable Ingestion

This document redefines the foundation: GrowthOS is **not** a marketing app with connectors bolted on — it is a **generic, multi-project, pluggable metrics platform**. Any system (a website, a mobile app, a backend service, a POS, an IoT device, a third-party SaaS) can **push data in** through a stable ingestion contract, and the analytics/AI/war-room layers work on top of whatever arrives. Marketing/growth (docs 02–05) is just the first "solution pack" installed on this core.

## 1. Resource hierarchy (multi-project by design)

```
Platform
├── User (global identity — one account, one login)
│     └── Membership(user ↔ org)  ← many-to-many: a user can belong to MANY orgs
│
└── Organization (tenant, billing boundary)
    ├── Members (memberships of global users) + Org Roles
    ├── Teams (optional grouping for permission grants)
    ├── Org Resource Library (shared resources, attached to projects explicitly — §1.2)
    │     ├── Connection credentials (ad accounts, billing, CRM)
    │     ├── Templates: metric definitions, schemas, dashboards, guardrail policies
    │     ├── People registry (dim_team_member), brand assets
    │     └── Plugin installs/licenses
    └── Project (isolation boundary for data, config, keys)   ← a business, product, app, or client
        ├── Environments: production / staging / development
        ├── Data Sources (push sources + pull connectors)
        ├── Schema Registry (event/entity/metric definitions)
        ├── Dashboards, Goals, War-rooms, Alerts, Automations
        └── API Keys & Service Accounts (scoped to project+env)
```

Rules:
- **Organization** = customer/tenant. Billing, SSO, member directory, org-wide policies live here.
- **Project** = the unit of data isolation. One org can hold many projects (multiple products, brands, regions, or — for agencies — *clients*). Nothing crosses projects unless explicitly shared (see cross-project views, §6).
- **Environment** separates prod data from test data — every API key and data source is bound to one environment, so integration testing never pollutes real metrics.
- All identifiers are hierarchical: `org/{org_id}/project/{project_id}/env/{env}` — used consistently in APIs, warehouse partitioning, and permission checks.

### 1.1 Users & organizations — many-to-many

A **User** is a single global identity (one email/SSO login). Membership in organizations is a separate relation:

```
users/{user_id}                      -- global: auth identity, name, avatar, locale, notification prefs
orgs/{org_id}/members/{user_id}      -- membership: org roles, per-org display settings, status
                                     --   (invited | active | suspended), joined_at
```

- A user can hold memberships in **any number of orgs** (freelancer working for three companies; agency employee who is also a customer in their own org). Each membership carries its **own roles** — Org Admin in one org, Viewer of a single project in another.
- **Sessions are org-scoped**: after login the user picks (or is deep-linked into) an org context; the org switcher lists only orgs where a membership exists. All permission checks resolve `(user, current org) → membership → bindings`.
- **Cross-org isolation is absolute** — stronger than cross-project: nothing (search, notifications, AI memory, recent items, autocomplete) may surface artifacts from org B while in org A's context. The isolation test suite (§5.6) covers the org boundary as well as the project boundary.
- Leaving/being removed from an org deletes the membership, not the user; the same user keeps their other orgs untouched. Org-level SCIM/SSO policies (e.g., "require SAML for this org") apply to the *membership*, not the global account — a user may authenticate differently per org.
- Project role bindings always hang off a membership: removing the membership cascades removal of all that user's bindings in the org (single revocation point).

### 1.2 Org Resource Library — shared resources, explicit attachment

Resources that naturally belong to the organization (not to one project) live in the org library and are **explicitly attached** to projects:

| Resource | Example | Attachment semantics |
|---|---|---|
| **Connection credentials** | one Google Ads MCC / Meta Business Manager login serving several projects | credential stored once (org vault); each project attaches it and selects *which ad accounts* it may read — a project never sees sibling accounts |
| **Templates** | org-standard metric definitions, schemas, dashboard layouts, guardrail policies | attach = copy-with-link; projects can adopt updates or pin a version |
| **People registry** | `dim_team_member` (reps, agents, managers + photos) | attached per project so leaderboards/wins resolve people without re-entry |
| **Plugin installs / licenses** | org buys a premium plugin once | enable per project |
| **Brand assets** | logos, colors for white-label boards | referenced by attached projects |

Rules: attachment is **project-admin initiated + org-resource-owner approved** (or org-admin pushed); an attached resource exposes only the slice granted to that project; detaching revokes immediately. Resource usage is audited per project. This keeps the convenience of sharing without eroding the §5.6 isolation guarantee — *the library is a doorway with a guard, not a hole in the wall*.

## 2. Generic data model (the platform knows nothing about "marketing")

The core ingests only three generic shapes. Everything else — funnels, MRR, CAC — is **configuration defined per project** on top of them:

| Shape | What it is | Examples |
|---|---|---|
| **Entity** | A durable thing with identity + attributes | customer, account, order, campaign, device, store, patient |
| **Event** | Something that happened, at a time, to entities | `signup`, `purchase`, `page_view`, `charge_failed`, `ticket_closed`, `sensor_reading` |
| **Measure** | A pre-aggregated numeric fact (for systems that only have aggregates) | daily ad spend by campaign, monthly payroll, inventory level |

- Each project registers **schemas** for its entities/events/measures in a **Schema Registry** (typed fields, required/optional, PII flags, identity keys). Schemas are versioned; unknown fields are quarantined, not dropped.
- **Identity resolution** is generic: any event can carry one or more identity keys (`user_id`, `email_hash`, `device_id`, `click_id`, custom); the stitching engine (doc 04 §4) works off registered identity keys, not hard-coded ones.
- The **semantic metric layer** (doc 04) sits on top: metrics/funnels/cohorts are defined per project against these generic tables. The marketing KPI packs from doc 05 are just pre-built schema+metric bundles.

## 3. Ingestion plane — how *any* system sends data (push-first)

The pull connectors in doc 02 remain, but the primary contract is now an **open push API** so many systems can send data without us building anything:

### 3.1 Ingest API (HTTP)
```
POST /v1/ingest/events        { batch of events }
POST /v1/ingest/entities      { upserts }
POST /v1/ingest/measures      { aggregated facts }
POST /v1/ingest/{custom-hook} { raw payload → mapped by a plugin/mapping }
```
- **Auth**: per-project+environment **API keys** (write-only ingest scope) or HMAC-signed requests; optional mTLS for enterprise.
- **Semantics**: batched, idempotent (client `event_id` dedup), at-least-once, 202-accepted with async validation results queryable per batch.
- **Validation**: against the project's Schema Registry — reject / quarantine / auto-evolve per project policy; dead-letter queue with replay from the admin console.
- **Limits**: per-key rate limits and quotas; backpressure with `Retry-After`.

### 3.2 SDKs & agents
- Thin SDKs (JS/browser, Node, Python, PHP, mobile) that wrap the Ingest API + identity/consent capture (doc 02 §5 generalizes to this).
- **Webhook receiver**: any SaaS that can fire webhooks (Stripe, Shopify, a CRM, a custom ERP) gets a per-project inbound webhook URL; a **mapping layer** (UI + AI-assisted) transforms arbitrary payloads → registered events. "Point your webhook here, map three fields, done."
- **Warehouse/file drops**: S3/GCS bucket or SFTP drop + CSV/Parquet mapping for legacy systems that can only export files.

### 3.3 Streaming
- Native Pub/Sub / Kafka topic per project for high-volume producers (backend services publish events directly).

## 4. Plugin architecture (pluggable everywhere, not just ingestion)

A single **plugin framework** with a manifest, sandboxed runtime, and a registry — so the platform is extended without touching core code. Plugin types:

| Plugin type | Extends | Examples |
|---|---|---|
| **Source (pull)** | Scheduled connectors (doc 02 contract) | Google Ads, Meta, Stripe, custom ERP puller |
| **Source (push mapping)** | Webhook/ingest payload → schema mapping | "Shopify webhook pack", "WooCommerce pack", custom |
| **Transform** | Derived events/entities in the pipeline | lead-scoring, sessionization, currency normalization |
| **Metric pack** | Bundles of schemas + semantic metrics + dashboards | "SaaS pack", "E-com pack", "Restaurant pack" (doc 05 verticals become plugins) |
| **Action / destination** | Outbound side-effects | ad-platform write-back, Slack, email, custom webhooks out, CRM update |
| **AI tool** | Extra tools exposed to the AI Analyst/agents | "query inventory system", vertical-specific calculators |
| **Panel/visualization** | Custom dashboard tiles | map widget, custom cohort viz |

Mechanics:
- **Manifest** (`plugin.yaml`): identity, type, required scopes, config schema, schemas it registers, endpoints it implements.
- **Runtime**: hosted plugins run as isolated workloads (container/V8 isolate) with scoped, short-lived credentials — a plugin only sees its own project's data and only the scopes it declared.
- **Registry/marketplace**: official, partner, and private (per-org) plugins; versioned, reviewable, installable per project by a project admin.
- **Everything above ships as a plugin** — including our own Google/Meta connectors and the marketing metric packs — which keeps the core honest and generic.

## 5. Permissions model (admins at every level, deny-by-default)

### 5.1 Principals
Humans, **service accounts** (for machines/plugins), and **API keys** (narrow, key-scoped). All permission checks go through one policy engine (e.g., Zanzibar-style relations or Casbin/OPA), evaluated as: *principal → role binding → resource (org / project / env / object) → permission*.

### 5.2 Role bindings at any level of the hierarchy
A role can be granted at **platform, org, project, or object** level and inherits downward:

| Role | Typical scope | Can |
|---|---|---|
| **Platform Admin** (operator) | platform | Everything, audited; tenant ops, plugin registry review |
| **Org Owner / Org Admin** | org | Billing, members, SSO/SCIM, create projects, org policies |
| **Project Admin** | project | Manage sources/keys/schemas/plugins/automations/members of that project |
| **Editor / Analyst** | project | Create metrics, dashboards, goals, alerts; no keys/sources |
| **Operator** | project | Approve/execute automations (elevated, money-moving scope — separate from Editor) |
| **Viewer** | project or dashboard | Read-only; can be limited to specific dashboards |
| **Ingest-only** (service) | project+env | Push data, nothing else |
| **Custom roles** | any | Enterprise: compose from the permission catalog |

### 5.3 Permission catalog (granular scopes)
`project.manage`, `members.manage`, `sources.manage`, `keys.manage`, `schema.write`, `metrics.write`, `dashboards.write`, `automation.approve`, `automation.execute`, `data.export`, `pii.read`, `ai.use`, `plugin.install`, … Each role = a bundle of these; API keys carry an explicit scope list (least privilege).

### 5.4 Data-level controls
- Row-level: project/env isolation enforced in the query layer.
- Column/metric-level: hide revenue or PII-derived fields from specific roles.
- **PII gate**: `pii.read` is a separate grant; default roles see hashed/masked values.

### 5.5 Governance
- Every grant, key creation, schema change, and automation is in the **immutable audit log** (doc 06).
- Key hygiene: expiry, rotation reminders, last-used tracking, one-click revoke.
- SSO/SCIM group → role mapping for enterprise; access reviews export.

### 5.6 Hard isolation & invisible projects (zero-leakage guarantee)

A user granted access to some projects must be able to work **without ever learning that other projects exist**. This is a product requirement, not just a security nicety (agencies with competing clients; internal compartmentalization):

- **Non-enumeration everywhere**: every "list projects/dashboards/sources/members" endpoint returns only resources the principal holds a binding on. There is no org-wide listing for non-org-admins.
- **404, not 403**: requesting a resource in a project you have no binding on returns *not found* — a 403 would confirm existence. Same for slugs/IDs in URLs.
- **No cross-project query path**: the Metrics API compiler injects the project scope from the *authenticated principal*, never from request parameters alone; a query can only ever compile against one project's dataset (cross-project org dashboards run as separate per-project queries merged only for principals holding bindings on *all* included projects).
- **Isolated storage**: warehouse dataset per project (not just row filters) from the default tier up; Firestore documents partitioned by project path; caches (Redis) keyed with project prefix and never shared across principals of different projects.
- **Isolated side channels**: search indexes, audit-log views, notification streams, exports, AI conversation memory, and file attachments are all project-scoped. The AI Analyst's context for a session contains only projects the asking user can see — prompts are assembled per-principal, never from an org-wide pool.
- **Membership invisibility**: project members see only that project's member list; user directory lookups outside shared projects return nothing.
- **Invitation flow**: users are invited *to a project*; they may hold zero org-level visibility. The org switcher/UI renders only permitted projects — a one-project user sees a single-project product.
- **Verification**: an automated **isolation test suite** runs in CI — a synthetic two-project tenant where principal A must fail to observe any artifact of project B across every API surface (list, get, search, metrics, exports, webhooks, AI). Any new endpoint must register an isolation test to pass review. Periodic pen-tests target exactly this property.

## 6. Cross-project & org-level views

- **Org dashboards**: roll up metrics across projects the viewer can access (agency portfolio, multi-brand exec view) — computed as federated queries, never by copying data between projects.
- **Shared definitions**: an org can publish metric/schema templates for its projects to adopt (governed consistency without forced coupling).
- **Benchmarks** (doc 05 §5) remain opt-in and anonymized at the platform level.

## 7. What this changes in the other docs

| Doc | Adjustment |
|---|---|
| 01 Architecture | Add **Ingest Gateway** (push API, webhook receiver, validation, DLQ) and **Plugin Runtime** as core services; warehouse partitioning by `org/project/env`. |
| 02 Integrations | Pull connectors become **source plugins**; conversion send-back becomes an **action plugin**; §5 edge SDK generalizes to the platform SDKs here. |
| 03 AI | AI tools become pluggable (`AI tool` plugin type); NL analyst works per-project with cross-project scope only if permitted. |
| 04 Data model | Canonical marketing tables become the **marketing metric pack's** registered schemas on the generic entity/event/measure core. |
| 05 Verticals | Vertical adapters ship as **metric-pack plugins** in the registry. |
| 06 Admin | Admin console gains org/project/env hierarchy, schema registry UI, key management, plugin management, ingest health (DLQ/replay). |

## 8. MVP cut for the generic core

Phase-1 scope (folds into doc 07's plan):
1. Org → Project → Env hierarchy + role bindings (Owner/Admin/Editor/Viewer/Ingest-only) + API keys.
2. Ingest API (events/entities/measures) + schema registry + validation + DLQ/replay.
3. Webhook receiver with UI mapping (AI-assisted field mapping).
4. Google/Meta/Stripe pull connectors re-homed as the first **source plugins**; SaaS marketing pack as the first **metric pack plugin**.
5. Admin surfaces: members & roles, keys, sources health, schema browser, audit log.
