# Connecting a site or product to GrowthOS

How an external product (a SaaS like EasySign, a marketing site, a store) sends its data to
GrowthOS, and how to confirm the connection works. The same steps apply to every site. Nothing in
them is specific to one customer.

Everything below is also shown, already filled in for the chosen environment, on the project's
**Installation** page (`/orgs/<org>/projects/<project>/install`).

## 1. Decide what you send

| What | Sent from | Schema kind | Example |
| --- | --- | --- | --- |
| Where each visit came from | the browser | event `touchpoint` (automatic) | utm_*, gclid, landing page |
| What visitors and users do | browser or server | event | `cta_click`, `signup`, `document_signed` |
| Who your customers are | server | entity | `customer` (plan, created_at, ...) |
| Money and amounts | server | measure | `mrr`, `revenue` |

Every name must be a **registered schema** in the project (Schemas page, or the MCP
tools `register_schema` / `apply_schema_manifest`), and each record must carry that schema's required fields. A record that
does not fit is **quarantined** with a reason. The rest of its batch still lands. Full contract:
[`docs/api/ingest.md`](../api/ingest.md).

## 2. Mint the keys (Keys page)

| Key | Prefix | Where | Can |
| --- | --- | --- | --- |
| Browser key | `gos_pk_live_` / `gos_pk_test_` | in your web pages | send events only, only from the domains you list |
| Server key | `gos_live_` / `gos_test_` | your server's secrets only | everything its scopes allow (`ingest.write`) |

The key decides the project and the environment, so there is no project id in your code. Use a
`test` key for dev/staging and a `live` key for prod. A server key in a web page is refused (403),
and so is a browser key from a domain that is not listed.

## 3. Install

### Website: the snippet

Paste the snippet from the Installation page (or Keys page) once into the `<head>` of every page.
It loads `https://<growthos-app>/sdk/v1/growthos.js` asynchronously, sends one `touchpoint` per
visit and exposes `GrowthOS.track / identify / reset / getAnonId`. Details:
[`@growthos/browser`](../../packages/sdk-browser/README.md).

### Single-page app: the browser package

```bash
npm install https://<growthos-app>/sdk/v1/growthos-browser.tgz
```

```ts
import { init, track, identify, getAnonId } from '@growthos/browser';
init({ key: 'gos_pk_live_...', api: 'https://<growthos-api>', pageViews: true });
```

### Server: the Node SDK

```bash
npm install https://<growthos-app>/sdk/v1/growthos-node.tgz
```

```ts
import { GrowthOS, eventId } from '@growthos/node';
const growthos = new GrowthOS({ apiKey: process.env.GROWTHOS_API_KEY! });
growthos.track({ event: 'signup', eventId: eventId('signup', user.id), customerId: user.id,
  anonId: anonIdFromBrowser, properties: { plan: 'free' } });
growthos.customer(user.id, { plan: 'free', created_at: user.createdAt.toISOString() });
await growthos.shutdown(); // or flush() at the end of each serverless invocation
```

Details: [`@growthos/node`](../../packages/sdk-node/README.md). Other languages call the HTTP API
directly ([`docs/api/ingest.md`](../api/ingest.md), OpenAPI at `GET /v1/ingest/contract`).

The `/sdk/v1/` addresses are served by GrowthOS itself and are exactly what `npm publish` would
ship. Once the packages are on npm, `npm install @growthos/node` / `@growthos/browser` is the same
code. `growthos-node.tgz` / `growthos-browser.tgz` are always the latest build; to pin one, vendor
`growthos-node-<version>.tgz` into the repo and depend on it with `file:`, so the lockfile never
sees its content change.

### Strict Content-Security-Policy: a relay

If the site's CSP cannot allow the GrowthOS API, send browser events to your own server and
forward them with `createRelayHandler` from `@growthos/node/relay` (it loads no Node built-in, so
it also runs on edge runtimes such as Cloudflare Pages). It only forwards the event names you
allow (by default `touchpoint` and `page_view`), with size caps. Point the browser SDK at it with
`init({ endpoint: '/api/growth' })`.

### History: backfill

Past records go through a backfill (`forBackfill(id)` in the Node SDK, `verifyBackfillRequest` for
the signed pull requests). They are kept apart from live data until the backfill completes.

## 4. Tie visits to customers

The browser SDK keeps an anonymous visitor id (`getAnonId()`). Send it to your server at signup and
pass it as `anonId` on the server's `signup` event. That links the signup, and everything the
customer does later, to the campaign of the visit. After login, `identify(user.id)` in the browser
tags later browser events with the customer.

## 5. Verify the installation

Every check below reports from the records that really arrived. Nothing synthetic is sent. For
each schema you expect, it says `receiving` (accepted in the last 24h), `stale`, `quarantined`
(with the reasons), `registered_no_data` or `not_registered`, and how to fix it.

| Where | How |
| --- | --- |
| GrowthOS app | Installation page - **Listen live** re-checks every 5 seconds while you click through your site |
| Browser console | `GrowthOS.verify(['touchpoint', 'cta_click'])` |
| Terminal / CI | `GROWTHOS_API_KEY=gos_live_... npx growthos verify --expect touchpoint,signup,customer` (exit 0 ok, 1 attention, 2 error) |
| Code | `await growthos.verify({ expect: [...] })` |
| HTTP | `GET /v1/ingest/verify?expect=touchpoint,signup` with the key |
| AI agent | MCP tool `check_installation` |

A typical first run:

1. Open the Installation page and click **Listen live**.
2. Visit the site through a link with `?utm_source=test&utm_campaign=install-check`.
   `touchpoint` turns to *Receiving*.
3. Do the actions you track (sign up, ...). Each expected schema turns to *Receiving*, or shows
   why it was rejected.
4. Add the CLI check to your deploy pipeline so a broken release is caught the same day.

Ongoing monitoring lives on the **Ingest health** page, and a tracking-broke alert fires when an
event that used to arrive stops.
