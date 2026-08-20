# Ingest API reference (as implemented)

This is a developer reference for the **currently implemented** Ingest API — the exact
request shapes, validation rules, and responses you get from `apps/api` today. It
deliberately documents *what the code does*, not the full aspirational contract in
[`docs/plan/12-api-reference.md`](../plan/12-api-reference.md); the divergences from that
plan sketch are called out explicitly in [§9](#9-differences-from-the-plan-sketch).

If you are pushing real data and something is silently missing from your boards, read
[§5 (validation & quarantine)](#5-validation--quarantine) and
[§9](#9-differences-from-the-plan-sketch) first — the three record kinds do **not** share a
payload shape, and unknown fields are quarantined, not dropped or accepted.

## 1. Authentication

Every ingest request is authenticated by a **bearer API key**, not a human/service-account
session:

```http
Authorization: Bearer gos_live_xxxxxxxx        # or gos_test_… for a test environment
```

- Keys are minted per **project + environment** on the admin Keys page (KAN-30) and carry
  explicit scopes. Every ingest route requires the **`ingest.write`** scope.
- The key alone resolves the org, project, and environment the batch lands in — there is no
  org/project id in the URL. A `gos_test_` key lands in that environment; a `gos_live_` key
  lands in the live one. (See `authenticateApiKey`.)
- Auth failures follow a 401-vs-403 split:
  - **401** — no usable credential: missing/malformed `Authorization` header, or an unknown
    or revoked key.
  - **403** — a real, live key that lacks the `ingest.write` scope.
- **429** — the key's per-key rate-limit bucket is exhausted; the response carries a
  `Retry-After` header (seconds). Rate limiting is checked only *after* auth + scope pass,
  so an unknown key can never exhaust a real key's budget.

## 2. Endpoints

| Method | Path | Body kind |
| ------ | ---- | --------- |
| `POST` | `/v1/ingest/events` | events (batch of behavioral events) |
| `POST` | `/v1/ingest/entities` | entity upserts of one `type` |
| `POST` | `/v1/ingest/measures` | pre-aggregated measures |
| `GET`  | `/v1/ingest/batches/{batch_id}` | per-record validation results for a prior batch |

All three `POST` endpoints return **`202 Accepted`** with a batch summary even when some (or
all) records were quarantined — a bad record quarantines only itself; it does not fail the
request. A request only 4xx's on a malformed *envelope* (see each shape below) or an
auth/rate-limit failure.

## 3. Request shapes

The single most important thing to know: **the schema-validated fields live in a different
sub-object for each kind** — `properties` for events, `attributes` for entities, `dimensions`
for measures — and each kind has its own set of *required top-level envelope fields* that are
**not** part of the schema.

### 3.1 Events — `POST /v1/ingest/events`

Records go in a top-level **`batch`** array (note: `batch`, not `records`).

```jsonc
{
  "batch": [
    {
      "event_id": "ord_5001-evt",              // required — client id, drives idempotency/dedup
      "event": "order_completed",              // required — schema name; must be a registered event schema
      "ts": "2026-07-03T10:15:00Z",            // required — ISO 8601 timestamp
      "properties": {                          // schema-validated fields go HERE
        "order_id": "ord_5001",
        "net": 349.0,
        "currency": "ILS"
      }
    }
  ]
}
```

- Required envelope fields: **`event_id`**, **`event`**, **`ts`** (each a non-empty,
  non-whitespace string). A record missing any of these is quarantined with
  `missing_field:<name>`.
- The schema family is the record's own **`event`** value.
- `properties` holds every field validated against that event schema. A missing `properties`
  is treated as `{}` (so a schema with required fields will quarantine the record for the
  missing fields).
- `anon_id` and `customer_id` are **implicitly accepted** inside `properties` on any event
  schema without being declared (the platform tracking snippet attaches them to every event) —
  see [§6](#6-implicit-event-envelope-fields).

### 3.2 Entities — `POST /v1/ingest/entities`

One request carries records of a single entity **`type`**.

```jsonc
{
  "type": "product",                           // required — non-empty string; the schema name for every record
  "records": [
    {
      "id": "sku_1",                           // required — client id; unique within this type
      "attributes": {                          // schema-validated fields go HERE
        "title": "Blue Widget",
        "price": 19.99
      }
    }
  ]
}
```

- Envelope: a missing/blank top-level `type` → **400**; a non-array `records` → **400**.
- Per record: `id` is required (quarantined with `missing_field:id` if absent). The schema
  family is the batch-level `type`, not a per-record field.
- `attributes` holds the schema-validated fields.
- Dedup is scoped **per type**: two different types may each carry an `id` of `123` without
  colliding.

### 3.3 Measures — `POST /v1/ingest/measures`

Pre-aggregated numeric measures. **This shape differs the most from events** — there is no
`properties`, the numeric payload is a required top-level `value`, and the dimensions are a
separate object.

```jsonc
{
  "records": [
    {
      "measure": "ad_spend",                   // required — schema name; must be a registered measure schema
      "ts": "2026-07-02",                      // required — ISO 8601 date or timestamp
      "value": 1250.5,                         // required — a real (non-NaN) number, at the TOP level
      "dimensions": {                          // schema-validated fields go HERE
        "channel": "meta",
        "campaign_id": "c_9"
      }
    }
  ]
}
```

- Required envelope fields: **`measure`** (non-empty string), **`ts`** (non-empty string),
  and **`value`** (a `number`, not a numeric string, and not `NaN`). A missing/mistyped one
  is quarantined with `missing_field:measure` / `missing_field:ts` / `missing_field:value`.
- The schema family is the record's own **`measure`** value.
- `dimensions` holds the schema-validated fields. The measure's numeric `value` is **not** a
  schema field — do not declare it on the measure schema, and do not put it inside
  `dimensions`. The generated warehouse mart exposes the envelope's `value` and `ts` as
  columns of their own, so a metric aggregates them directly (`column: "value"`,
  `timeColumn: "ts"`); both names are reserved on a measure schema for that reason.
- Measures carry no client id. Their dedup key is a natural key derived from
  `measure` + `ts` + canonicalized `dimensions`, so re-sending the identical aggregate is
  idempotent (see [§7](#7-idempotency--dedup)).

## 4. Envelope vs. schema fields

For every kind, ingest does two layers of checks:

1. **Envelope check** — the required top-level fields above (`event_id`/`event`/`ts`,
   `id`, `measure`/`ts`/`value`). A failure here quarantines the record with a
   `missing_field:<name>` reason *before* the schema is even consulted.
2. **Schema check** — the kind's field sub-object (`properties`/`attributes`/`dimensions`) is
   validated against the **active** registered schema for that name (see
   [§5](#5-validation--quarantine)).

Top-level fields other than the required envelope ones are **carried through in the stored raw
payload but are neither validated nor rejected**. Putting a schema field at the top level
instead of inside `properties`/`attributes`/`dimensions` means it will not be validated and
will not populate the warehouse column for that field.

## 5. Validation & quarantine

A schema for the record's kind + name must be **registered and active** (Schema Registry,
KAN-31) before ingest will accept it. Validation is reject-listed against the active schema's
declared fields:

| Reason | Meaning |
| ------ | ------- |
| `missing_field:<name>` | A required *envelope* field (see §4) was absent/blank/mistyped. |
| `schema_not_registered:<name>` | No active schema is registered for this kind + name in this project. |
| `missing_required_field:<name>` | A schema field marked required was absent from the field sub-object. |
| `field_type_mismatch:<name>` | A field's value did not match its declared type. |
| `unregistered_field:<name>` | A field present in the sub-object is not declared on the schema (and is not an implicit envelope field). Unknown fields are quarantined, never silently dropped. |

Declared field types are: `string`, `number` (non-NaN), `boolean`, `timestamp` (a parseable
date string), `object`, `array`.

A quarantined record's full raw payload is persisted, so it can be **replayed** from the
Ingest Health admin page (KAN-34/35) once its schema is fixed or evolved. A quarantined record
never claims its dedup slot, so a corrected retry of the same client id can still be accepted
later.

## 6. Implicit event envelope fields

On **event** records only, `anon_id` and `customer_id` are accepted inside `properties`
without being declared on the schema (they are validated as strings if present). The platform's
own tracking snippet (KAN-57) attaches them to every event it fires; without this implicit
acceptance, any hand-registered event schema would quarantine 100% of real snippet traffic with
`unregistered_field:anon_id`. To make either field participate in identity stitching (KAN-56),
still declare it explicitly with `is_identity_key`. This implicit acceptance applies to events
only — entity/measure validation is unchanged.

## 7. Idempotency & dedup

Each record's **client id** is the idempotency key; a client id already claimed by an earlier
**accepted** record in the same environment marks a later resend `duplicate`.

| Kind | Client id | Dedup scope |
| ---- | --------- | ----------- |
| event | `event_id` | environment + `event` schema name |
| entity | `id` | environment + `type` |
| measure | natural key: `measure` \| `ts` \| canonicalized `dimensions` | environment + `measure` schema name |

Two records sharing a client id within the *same* batch also dedupe against each other (only
the first is accepted). Dedup is not transactional: two concurrent batches presenting the same
client id can each pass the existence check before either claims it, so both may be accepted —
a deliberately deferred tradeoff (same posture as the schema-registry active-version read).

## 8. Responses

### 8.1 `POST` — 202 batch summary

```jsonc
{
  "batch_id": "b_789",
  "kind": "event",          // "event" | "entity" | "measure"
  "accepted": 1,
  "quarantined": 0,
  "duplicates": 0,
  "total": 1
}
```

### 8.2 `GET /v1/ingest/batches/{batch_id}` — per-record results

Scoped to the calling key's own org/project/environment — a batch id from another environment
or project returns **404** (non-enumeration: indistinguishable from a batch id that never
existed).

```jsonc
{
  "batch_id": "b_789",
  "kind": "event",
  "total": 2,
  "accepted": 1,
  "quarantined": 1,
  "duplicates": 0,
  "created_at": "2026-07-03T10:15:00.000Z",
  "records": [
    { "client_id": "ord_5001-evt", "status": "accepted" },
    { "client_id": "ord_5002-evt", "status": "quarantined", "reasons": ["unregistered_field:foo"] }
  ]
}
```

A record's `status` is one of `accepted`, `quarantined`, or `duplicate`; `reasons` is present
only for quarantined records.

### 8.3 Error responses

| Status | When |
| ------ | ---- |
| `400` | Malformed envelope (`events`: no `batch` array; `entities`: missing `type` or no `records` array; `measures`: no `records` array), an **empty** batch, or a batch of **more than 1000** records. |
| `401` | Missing/malformed bearer token, or unknown/revoked key. |
| `403` | Live key lacking the `ingest.write` scope. |
| `404` | `GET batches/{id}` for a batch not in the caller's own scope. |
| `429` | Per-key rate limit exceeded (carries `Retry-After`). |

## 9. Differences from the plan sketch

[`docs/plan/12-api-reference.md`](../plan/12-api-reference.md) sketches the *intended*
long-term contract. The following parts of that sketch are **not implemented today** — if you
send them, they are ignored (carried in the raw payload but never validated or used), not
honored:

- **Event `identities` / `context` blocks** and a top-level measure **`currency`** — ignored.
  Put any field you want validated/queryable inside `properties` (events) or `dimensions`
  (measures) and declare it on the schema.
- **`policy=auto_evolve`** — there is no auto-evolve. A schema must be registered and active
  before ingest will accept records for it; an unregistered name quarantines with
  `schema_not_registered`.
- **Commerce convenience endpoints** (`/v1/ingest/orders`, `/v1/ingest/subscriptions`,
  `/v1/ingest/refunds`) — not implemented. Use `/v1/ingest/events` with your own registered
  commerce event schemas.

## 10. Quick examples

```bash
# Event
curl -X POST "$INGEST_URL/v1/ingest/events" \
  -H "Authorization: Bearer $GOS_KEY" -H "Content-Type: application/json" \
  -d '{"batch":[{"event_id":"e1","event":"order_completed","ts":"2026-07-03T10:15:00Z","properties":{"net":349.0}}]}'

# Entity
curl -X POST "$INGEST_URL/v1/ingest/entities" \
  -H "Authorization: Bearer $GOS_KEY" -H "Content-Type: application/json" \
  -d '{"type":"product","records":[{"id":"sku_1","attributes":{"title":"Blue Widget","price":19.99}}]}'

# Measure  (note: top-level "value", dimensions separate, no "properties")
curl -X POST "$INGEST_URL/v1/ingest/measures" \
  -H "Authorization: Bearer $GOS_KEY" -H "Content-Type: application/json" \
  -d '{"records":[{"measure":"ad_spend","ts":"2026-07-02","value":1250.5,"dimensions":{"channel":"meta"}}]}'

# Per-record results
curl "$INGEST_URL/v1/ingest/batches/b_789" -H "Authorization: Bearer $GOS_KEY"
```
