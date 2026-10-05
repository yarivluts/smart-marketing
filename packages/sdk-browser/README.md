# @growthos/browser

GrowthOS on your website: which campaign brought each visitor, what they did, and - once they sign
up - who they are. About 9 KB, no dependencies, never blocks the page.

## Install

Mint a **browser key** on the project's Keys page (Keys -> "Browser key"), listing the domains of
your site. The page then shows the snippet to paste once in the `<head>` of every page:

```html
<!-- GrowthOS -->
<script>
  !function(w,d){...}(window,document);   // the loader: queues calls until the script arrives
  GrowthOS.init({"key":"gos_pk_live_...","api":"https://<growthos-api>"});
</script>
```

Or with a bundler: `npm install https://<growthos-app>/sdk/v1/growthos-browser.tgz` (until it
is on npm as `@growthos/browser`), then

```ts
import { init, track, identify, getAnonId } from '@growthos/browser';
init({ key: 'gos_pk_live_...', api: 'https://<growthos-api>' });
```

A browser key is public by design: it can only send events, and only from the domains you listed
(a page on another domain gets 403). Never put a secret `gos_live_` key in a page.

## What it sends

- **touchpoint** - at the start of each visit (first page, after 30 quiet minutes, or a link with
  another campaign): `utm_*`, the ad click id (gclid / fbclid / msclkid / ttclid), landing page,
  referrer and channel. Attribution credits it, so it is always the visit's first event.
- **Your events** - `GrowthOS.track('cta_click', { cta: 'hero_signup' })`. The name must be a
  registered event schema, and every property declared on it.
- **page_view** - only with `init({ pageViews: true })`: on load and on every in-app navigation.

Every event carries `anon_id` (and `customer_id` after `identify`) inside its properties.

```ts
GrowthOS.identify(user.id);   // after signup/login: later events are tied to the customer
GrowthOS.reset();             // on logout
const anonId = GrowthOS.getAnonId(); // send it to your server at signup...
```

...and pass it on the server's signup event (`@growthos/node`: `track({ event: 'signup', anonId })`),
so the signup is credited to the campaign of the visit.

Events are batched (10 or 1 second) and whatever is left when the page is hidden or closed goes out
with `navigator.sendBeacon`.

## Consent

```ts
init({ key, consent: 'pending' }); // nothing stored or sent
GrowthOS.consent('granted');        // sends what waited
GrowthOS.consent('denied');         // drops it and clears the stored ids
```

## Check the installation

In the browser console on your site:

```js
GrowthOS.verify(['touchpoint', 'cta_click'])
```

prints whether each schema is `receiving`, `quarantined` (with the reason), `not_registered` and
so on - from what really arrived. A rejected record is always logged to the console with its
reason; `init({ debug: true })` also logs every send.

## Strict Content-Security-Policy

If your CSP only allows your own origin, send through a relay on your server (with
`@growthos/node`'s `createRelayHandler`) and point the SDK at it:

```ts
init({ endpoint: '/api/growth' });
```
