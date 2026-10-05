# @growthos/node

Send your product's events, customers and measures to GrowthOS from Node.js (18+). No
dependencies. Batching, retries, a clear result for every record, a relay for browser events,
backfill helpers and an installation check.

```bash
npm install @growthos/node
```

## Quick start

Mint a **server key** on the project's Keys page (scope `ingest.write`). The key decides the
project and the environment (`gos_test_...` for dev/staging, `gos_live_...` for prod) - there is
no project id in the code.

```ts
import { GrowthOS, eventId } from '@growthos/node';

const growthos = new GrowthOS({ apiKey: process.env.GROWTHOS_API_KEY! });

// An event. eventId() makes a stable id from your own data, so a retried trigger is a duplicate,
// not a second signup. anonId is the visitor id from the browser SDK (getAnonId()), which ties the
// signup back to the visit and its campaign.
growthos.track({
  event: 'signup',
  eventId: eventId('signup', user.id),
  customerId: user.id,
  anonId: user.growthAnonId,
  properties: { plan: 'free', signup_method: 'google' },
});

// The customer row: send EVERY attribute each time - an entity record replaces the whole row.
growthos.customer(user.id, { plan: 'free', created_at: user.createdAt.toISOString() });

// Before the process ends (and at the end of every serverless invocation):
await growthos.shutdown();
```

Every name you send (`signup`, `customer`, ...) must be a registered schema, and every property
declared on it - otherwise that record is quarantined (the rest of the batch still lands).

## What happened to each record

```ts
const result = await growthos.flush();
// { ok, accepted, quarantined, duplicates, rejected: [{ clientId, status, reasons }], errors }
for (const record of result.rejected) console.warn(record.clientId, record.reasons);
```

Or pass `onResult` / `onError` to the constructor to log every batch sent in the background.
`sendEvents()`, `sendEntities()` and `sendMeasures()` send right away and throw a `GrowthOSError`
when a batch cannot be delivered.

| Option | Default | |
| --- | --- | --- |
| `flushAt` | 100 | send once this many records are waiting (max 1000 per batch) |
| `flushIntervalMs` | 5000 | ...or this long after the first one; 0 = only on `flush()` |
| `maxRetries` | 5 | on 429 (honours `Retry-After`), 5xx and network errors; never on other 4xx |
| `timeoutMs` | 10000 | per request |
| `baseUrl` | `GROWTHOS_BASE_URL` or production | |
| `disabled` | false | send nothing (tests) |

## Check the installation

```bash
GROWTHOS_API_KEY=gos_live_... npx @growthos/node verify --expect touchpoint,signup,customer
```

```
Project:     Website (abc123)
Environment: prod
  [OK  ] touchpoint  receiving (last 2026-10-05T11:59:02Z)
  [FAIL] signup      quarantined (never received, 3 in quarantine)
                     -> Every "signup" record was rejected: missing_required_field:plan. Fix the sender ...
Status: needs attention (see above).
```

Exit code 0 when everything expected is arriving, 1 when something needs attention, 2 when the
check failed - so it fits in CI or a deploy script. In code: `await growthos.verify({ expect })`.
Every status comes from records that really arrived (or were rejected); checking sends nothing.

For CI conformance tests, `validateEvents()` / `validateEntities()` / `validateMeasures()` run the
same checks as ingest without storing anything.

## Relay browser events (strict CSP)

The browser SDK can send straight to GrowthOS with a publishable key. If your Content-Security-Policy
only allows your own origin, relay through your server instead - the secret key never reaches the page:

```ts
// Next.js: app/api/growth/route.ts (any Fetch API runtime: Cloudflare Workers, Deno, Bun)
import { createRelayHandler } from '@growthos/node';
export const POST = createRelayHandler({
  apiKey: process.env.GROWTHOS_API_KEY!,
  allowedEvents: ['touchpoint', 'page_view', 'cta_click'],
});

// Express / Node http
app.post('/api/growth', createRelayNodeHandler({ apiKey, allowedEvents: ['touchpoint', 'page_view'] }));
```

Only the listed event names pass (default: `touchpoint`, `page_view`) - a page is public, so the
relay must not let anyone send any event in your name.

## Backfill

When GrowthOS asks your endpoint to resend existing records (Ingest health -> Backfill):

```ts
import { verifyBackfillRequest } from '@growthos/node';

const check = verifyBackfillRequest({ secret: process.env.GROWTHOS_BACKFILL_SECRET!, headers: req.headers, body: rawBody });
if (!check.ok) return res.status(401).end();
res.status(202).end(); // answer fast, then:

const backfill = growthos.forBackfill(check.request.backfill_id); // tags every batch
for await (const page of allUsers()) await backfill.sendEntities('customer', page.map(toCustomerRecord));
await growthos.completeBackfill(check.request.backfill_id, { status: 'completed', recordsSent, batches });
```

The full API contract (shapes, rules, limits) is served at `GET /v1/ingest/contract`.
