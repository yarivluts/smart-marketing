export interface EmbedSnippetOptions {
  /** An `ingest.write`-scoped project API key (KAN-28/30) — safe to expose client-side, see `client.ts`'s own doc comment for why. */
  writeKey: string;
  /** The GrowthOS ingest API's base URL, e.g. `https://api.example.com/v1/ingest`. */
  ingestBaseUrl: string;
}

/**
 * The vanilla-JS body of the embeddable tracking snippet (KAN-57 AC: "JS
 * snippet ... storing UTM/click-ids at entry, attached to ingest events"). A
 * deliberately self-contained, dependency-free reimplementation of
 * `client.ts`'s capture/attach behavior — a site that can only paste a
 * `<script>` tag (no build step, no npm) can't `import` `@growthos/tracking-sdk`,
 * so this has to be plain, portable JS rather than a reference to the real
 * module. Exported separately from `renderEmbedSnippet` so tests can execute
 * the exact shipped logic without string-slicing `<script>` tags back out.
 */
export function buildEmbedSnippetBody(options: EmbedSnippetOptions): string {
  const writeKey = JSON.stringify(options.writeKey);
  const ingestBaseUrl = JSON.stringify(options.ingestBaseUrl);

  return `(function () {
  var GROWTHOS_WRITE_KEY = ${writeKey};
  var GROWTHOS_INGEST_BASE_URL = ${ingestBaseUrl};
  var STORAGE_KEY_ANON = 'growthos_anon_id';
  var STORAGE_KEY_CUSTOMER = 'growthos_customer_id';

  function getStorage() {
    try {
      var probe = '__growthos_storage_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (e) {
      var mem = {};
      return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null; },
        setItem: function (key, value) { mem[key] = value; },
      };
    }
  }
  var storage = getStorage();

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function ensureId(key) {
    var existing = storage.getItem(key);
    if (existing) return { id: existing, isNew: false };
    var created = uuid();
    storage.setItem(key, created);
    return { id: created, isNew: true };
  }

  function send(records) {
    try {
      fetch(GROWTHOS_INGEST_BASE_URL + '/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROWTHOS_WRITE_KEY },
        body: JSON.stringify({ batch: records }),
        keepalive: true,
      });
    } catch (e) {
      // Best-effort — a dropped network call must never break the host page.
    }
  }

  var CLICK_ID_PARAMS = [
    { param: 'gclid', channel: 'paid_search' },
    { param: 'msclkid', channel: 'paid_search' },
    { param: 'fbclid', channel: 'paid_social' },
    { param: 'ttclid', channel: 'paid_social' },
  ];

  function trimmedOrUndefined(value) {
    var trimmed = value && value.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }

  function isCrossSiteReferrer(referrer, pageOrigin) {
    if (!referrer) return false;
    try {
      return new URL(referrer).origin !== pageOrigin;
    } catch (e) {
      return false;
    }
  }

  function captureAcquisitionProperties() {
    var url = new URL(window.location.href);
    var query = url.searchParams;

    var matchedClick = null;
    for (var i = 0; i < CLICK_ID_PARAMS.length; i++) {
      var value = trimmedOrUndefined(query.get(CLICK_ID_PARAMS[i].param));
      if (value) {
        matchedClick = { value: value, channel: CLICK_ID_PARAMS[i].channel };
        break;
      }
    }

    var utmSource = trimmedOrUndefined(query.get('utm_source'));
    var utmMedium = trimmedOrUndefined(query.get('utm_medium'));
    var utmCampaign = trimmedOrUndefined(query.get('utm_campaign'));
    var utmContent = trimmedOrUndefined(query.get('utm_content'));
    var utmTerm = trimmedOrUndefined(query.get('utm_term'));
    var referrer = trimmedOrUndefined(document.referrer);
    var channel = matchedClick
      ? matchedClick.channel
      : utmMedium
        ? utmMedium.toLowerCase()
        : isCrossSiteReferrer(referrer, url.origin)
          ? 'referral'
          : 'direct';

    var properties = {};
    if (matchedClick) properties.click_id = matchedClick.value;
    if (utmSource) properties.utm_source = utmSource;
    if (utmMedium) properties.utm_medium = utmMedium;
    if (utmCampaign) properties.utm_campaign = utmCampaign;
    if (utmContent) properties.utm_content = utmContent;
    if (utmTerm) properties.utm_term = utmTerm;
    properties.landing_page = url.origin + url.pathname;
    if (referrer) properties.referrer = referrer;
    properties.channel = channel;
    return properties;
  }

  // Mints the anon id on this browser's first-ever call, firing its touchpoint
  // capture at that exact moment — shared by page()/track()/identify() so
  // whichever one runs first still captures the entry touchpoint (this
  // snippet always calls page() itself at the bottom, but track()/identify()
  // are also exposed on window.growthos for a caller to invoke directly).
  function ensureAnonId() {
    var anon = ensureId(STORAGE_KEY_ANON);
    if (anon.isNew) {
      send([{ event_id: anon.id, event: 'touchpoint', ts: new Date().toISOString(), properties: captureAcquisitionProperties() }]);
    }
    return anon.id;
  }

  function page() {
    ensureAnonId();
  }

  function track(eventName, properties) {
    var anonId = ensureAnonId();
    var customerId = storage.getItem(STORAGE_KEY_CUSTOMER);
    var merged = {};
    for (var key in properties || {}) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) merged[key] = properties[key];
    }
    if (customerId) merged.customer_id = customerId;
    merged.anon_id = anonId;
    send([{ event_id: uuid(), event: eventName, ts: new Date().toISOString(), properties: merged }]);
  }

  function identify(customerId, traits) {
    storage.setItem(STORAGE_KEY_CUSTOMER, customerId);
    var merged = {};
    for (var key in traits || {}) {
      if (Object.prototype.hasOwnProperty.call(traits, key)) merged[key] = traits[key];
    }
    merged.customer_id = customerId;
    track('identify', merged);
  }

  window.growthos = {
    page: page,
    track: track,
    identify: identify,
    getAnonId: function () { return storage.getItem(STORAGE_KEY_ANON); },
  };
  page();
})();`;
}

/** Wraps `buildEmbedSnippetBody` in the copy-pasteable `<script>` tag the admin UI shows (KAN-57's "JS snippet" deliverable, as an inline embed rather than a hosted bundle a third-party site would have to be told to trust). */
export function renderEmbedSnippet(options: EmbedSnippetOptions): string {
  return `<script>\n${buildEmbedSnippetBody(options)}\n</script>`;
}
