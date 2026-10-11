import { TOUCHPOINT_SCHEMA_FIELDS, TOUCHPOINT_SCHEMA_NAME } from '../touchpoint-capture/touchpoint-schema';

/**
 * Every code sample in the Developers area, built in one place so the page renders exactly what
 * the tests execute against a test environment. Samples read secret keys from the
 * `GROWTHOS_API_KEY` environment variable (never inline), and default to TEST keys
 * (gos_test_ / gos_pk_test_), which act only on a project's dev or staging environment.
 */
export interface DeveloperGuideContext {
  /** The GrowthOS API base, without /v1 (e.g. https://api.example.com). */
  apiBase: string;
  /** The GrowthOS web app origin, which serves the SDKs under /sdk/v1/. */
  appBase: string;
  /** A publishable browser key to show in browser samples (public by design). */
  browserKey?: string;
  nodeSdkVersion: string;
  browserSdkVersion: string;
}

/** The env variable every server-side sample reads its secret key from. */
export const GUIDE_KEY_ENV = 'GROWTHOS_API_KEY';
export const GUIDE_BROWSER_KEY_PLACEHOLDER = 'gos_pk_test_...';

const trim = (url: string) => url.replace(/\/+$/, '');
const json = (value: unknown) => JSON.stringify(value, null, 2);

/** The schemas the guides send to. Registering them is step 1 of the quick start. */
export const GUIDE_SCHEMA_MANIFEST = {
  schemas: [
    {
      kind: 'event',
      name: TOUCHPOINT_SCHEMA_NAME,
      // Flags default to false, so only the true ones are spelled out.
      fields: TOUCHPOINT_SCHEMA_FIELDS.map((field) => ({
        name: field.name,
        type: field.type,
        ...(field.isRequired ? { is_required: true } : {}),
        ...(field.isPii ? { is_pii: true } : {}),
        ...(field.isIdentityKey ? { is_identity_key: true } : {}),
      })),
    },
    {
      kind: 'event',
      name: 'signup',
      fields: [
        { name: 'plan', type: 'string', is_required: true },
        { name: 'signup_method', type: 'string' },
      ],
    },
    { kind: 'event', name: 'cta_click', fields: [{ name: 'cta', type: 'string', is_required: true }] },
    {
      kind: 'entity',
      name: 'customer',
      fields: [
        { name: 'plan', type: 'string' },
        { name: 'created_at', type: 'timestamp' },
      ],
    },
    { kind: 'measure', name: 'mrr', fields: [{ name: 'plan', type: 'string' }] },
  ],
} as const;

/** The schema names a guide's install check expects once every sample has run. */
export const GUIDE_EXPECTED_SCHEMAS = ['touchpoint', 'signup', 'cta_click', 'customer', 'mrr'] as const;

/** `POST /v1/ingest/events` body: identity rides inside `properties`. */
export function sampleEventsBody(now: Date = new Date()) {
  return {
    batch: [
      {
        event_id: 'signup-user_123',
        event: 'signup',
        ts: now.toISOString(),
        properties: { customer_id: 'user_123', anon_id: 'anon_7f3c9a12', plan: 'free', signup_method: 'google' },
      },
    ],
  };
}

/** `POST /v1/ingest/entities` body: the WHOLE row, every time (an upsert replaces it). */
export function sampleEntitiesBody(now: Date = new Date()) {
  return {
    type: 'customer',
    records: [{ id: 'user_123', attributes: { plan: 'free', created_at: now.toISOString() } }],
  };
}

/** `POST /v1/ingest/measures` body: the number is a top-level `value`, dimensions are separate. */
export function sampleMeasuresBody(now: Date = new Date()) {
  return { records: [{ measure: 'mrr', ts: now.toISOString().slice(0, 10), value: 49, dimensions: { plan: 'pro' } }] };
}

/** A 202 batch summary as the ingest endpoints return it: one record accepted, one quarantined. */
export function sampleIngestResponse(): string {
  return json({
    batch_id: 'Hf3kQ9xTbL2mR8vN1pZc',
    kind: 'event',
    accepted: 1,
    quarantined: 1,
    duplicates: 0,
    total: 2,
    rejected: [{ client_id: 'signup-user_124', status: 'quarantined', reasons: ['missing_required_field:plan'] }],
  });
}

/** `POST /v1/metrics/query` body. */
export function sampleMetricQueryBody(now: Date = new Date()) {
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  return { metric: 'signups', time: { start, end, grain: 'day' } };
}

/** A JSON-RPC request to the MCP endpoint. */
export function sampleMcpRequest(method: 'tools/list' | 'tools/call', params?: Record<string, unknown>) {
  return { jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) };
}

export function curlIngest(ctx: DeveloperGuideContext, kind: 'events' | 'entities' | 'measures', now?: Date): string {
  const body = kind === 'events' ? sampleEventsBody(now) : kind === 'entities' ? sampleEntitiesBody(now) : sampleMeasuresBody(now);
  return [
    `curl -sS -X POST ${trim(ctx.apiBase)}/v1/ingest/${kind} \\`,
    `  -H "Authorization: Bearer $${GUIDE_KEY_ENV}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${JSON.stringify(body)}'`,
  ].join('\n');
}

export function curlVerify(ctx: DeveloperGuideContext): string {
  return [
    `curl -sS "${trim(ctx.apiBase)}/v1/ingest/verify?expect=${GUIDE_EXPECTED_SCHEMAS.join(',')}" \\`,
    `  -H "Authorization: Bearer $${GUIDE_KEY_ENV}"`,
  ].join('\n');
}

export function curlBatchStatus(ctx: DeveloperGuideContext): string {
  return `curl -sS ${trim(ctx.apiBase)}/v1/ingest/batches/<batch_id> -H "Authorization: Bearer $${GUIDE_KEY_ENV}"`;
}

export function curlContract(ctx: DeveloperGuideContext): string {
  return `curl -sS ${trim(ctx.apiBase)}/v1/ingest/contract`;
}

export function curlMetrics(ctx: DeveloperGuideContext, now?: Date): string {
  return [
    `curl -sS ${trim(ctx.apiBase)}/v1/metrics -H "Authorization: Bearer $${GUIDE_KEY_ENV}"`,
    '',
    `curl -sS -X POST ${trim(ctx.apiBase)}/v1/metrics/query \\`,
    `  -H "Authorization: Bearer $${GUIDE_KEY_ENV}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${JSON.stringify(sampleMetricQueryBody(now))}'`,
  ].join('\n');
}

export function curlMcp(ctx: DeveloperGuideContext, method: 'tools/list' | 'tools/call', params?: Record<string, unknown>): string {
  return [
    `curl -sS -X POST ${trim(ctx.apiBase)}/v1/mcp \\`,
    `  -H "Authorization: Bearer $${GUIDE_KEY_ENV}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Accept: application/json, text/event-stream" \\`,
    `  -d '${JSON.stringify(sampleMcpRequest(method, params))}'`,
  ].join('\n');
}

/** The metric the API guide queries: daily signups, counted from the events core table. */
export const GUIDE_METRIC = {
  name: 'signups',
  kind: 'aggregation',
  function: 'count',
  table: 'events',
  column: 'event_id',
  time_column: 'occurred_at',
  filters: [{ field: 'event_type', op: '=', value: 'signup' }],
  unit: 'count',
} as const;

/** Registers GUIDE_METRIC through MCP's register_metric (needs metrics.write). */
export function curlRegisterMetric(ctx: DeveloperGuideContext): string {
  return curlMcp(ctx, 'tools/call', { name: 'register_metric', arguments: GUIDE_METRIC });
}

/** Registers the guide's schemas through MCP's apply_schema_manifest (needs schema.write). */
export function curlApplySchemaManifest(ctx: DeveloperGuideContext): string {
  return curlMcp(ctx, 'tools/call', { name: 'apply_schema_manifest', arguments: GUIDE_SCHEMA_MANIFEST });
}

/** The manifest as readable JSON: one line per field, so a schema reads as a short list. */
export function schemaManifestJson(): string {
  const schemas = GUIDE_SCHEMA_MANIFEST.schemas.map((schema) => {
    const fields = schema.fields.map((field) => `        ${JSON.stringify(field).replace(/,"/g, ', "').replace(/":/g, '": ')}`);
    return [
      '    {',
      `      "kind": ${JSON.stringify(schema.kind)},`,
      `      "name": ${JSON.stringify(schema.name)},`,
      '      "fields": [',
      fields.join(',\n'),
      '      ]',
      '    }',
    ].join('\n');
  });
  return ['{', '  "schemas": [', schemas.join(',\n'), '  ]', '}'].join('\n');
}

export function nodeInstall(ctx: DeveloperGuideContext): string {
  return `npm install ${trim(ctx.appBase)}/sdk/v1/growthos-node-${ctx.nodeSdkVersion}.tgz`;
}

export function browserInstall(ctx: DeveloperGuideContext): string {
  return `npm install ${trim(ctx.appBase)}/sdk/v1/growthos-browser-${ctx.browserSdkVersion}.tgz`;
}

/** A complete Node script: sends an event, an entity and a measure, prints what happened, verifies. */
export function nodeServerSample(ctx: DeveloperGuideContext): string {
  return `import { GrowthOS, eventId } from '@growthos/node';

const growthos = new GrowthOS({
  apiKey: process.env.${GUIDE_KEY_ENV}, // gos_test_... for dev/staging, gos_live_... for prod
  baseUrl: '${trim(ctx.apiBase)}',
});

// An event. eventId() makes a stable id from your own data, so a retried job is a duplicate,
// not a second signup. anonId is the browser's visitor id (GrowthOS.getAnonId()).
growthos.track({
  event: 'signup',
  eventId: eventId('signup', 'user_123'),
  customerId: 'user_123',
  anonId: 'anon_7f3c9a12',
  properties: { plan: 'free', signup_method: 'google' },
});

// The customer row: send EVERY attribute each time - an entity upsert replaces the whole row.
growthos.customer('user_123', { plan: 'free', created_at: new Date().toISOString() });

// A pre-aggregated number.
growthos.measure({ measure: 'mrr', value: 49, dimensions: { plan: 'pro' } });

const result = await growthos.flush(); // or shutdown() before the process exits
console.log({ accepted: result.accepted, quarantined: result.quarantined, rejected: result.rejected });

const check = await growthos.verify({ expect: ['signup', 'customer', 'mrr'] });
console.log(check.report.status);
await growthos.shutdown();`;
}

export function nodeVerifyCli(ctx: DeveloperGuideContext): string {
  return `${GUIDE_KEY_ENV}=gos_test_... npx growthos verify --base-url ${trim(ctx.apiBase)} --expect ${GUIDE_EXPECTED_SCHEMAS.join(',')}`;
}

export function browserNpmSample(ctx: DeveloperGuideContext): string {
  return `import { init, track, identify, getAnonId, reset } from '@growthos/browser';

init({
  key: '${ctx.browserKey ?? GUIDE_BROWSER_KEY_PLACEHOLDER}', // browser key: public, limited to your domains
  api: '${trim(ctx.apiBase)}',
});

// A touchpoint (utm_*, click ids, landing page, referrer) is sent automatically once per visit.
track('cta_click', { cta: 'hero_signup' });

// After signup/login: later events carry the customer id.
identify('user_123');

// Send the visitor id to your server at signup, so the signup is credited to this visit.
const anonId = getAnonId();

// On logout:
reset();`;
}

export function browserConsoleVerify(): string {
  return `GrowthOS.verify(['touchpoint', 'cta_click'])`;
}

export function browserConsentSample(ctx: DeveloperGuideContext): string {
  return `init({ key: '${ctx.browserKey ?? GUIDE_BROWSER_KEY_PLACEHOLDER}', api: '${trim(ctx.apiBase)}', consent: 'pending' }); // nothing stored or sent
GrowthOS.consent('granted'); // sends what waited
GrowthOS.consent('denied');  // drops it and clears the stored ids`;
}

/** The same-origin relay for a strict Content-Security-Policy (Next.js route handler). */
export function relaySample(ctx: DeveloperGuideContext): string {
  return `// app/api/growth/route.ts - the secret key stays on your server; the page posts here.
// '@growthos/node/relay' loads no Node built-in, so it also runs on edge runtimes.
import { createRelayHandler } from '@growthos/node/relay';

export const POST = createRelayHandler({
  apiKey: process.env.${GUIDE_KEY_ENV}!,
  baseUrl: '${trim(ctx.apiBase)}',
  allowedEvents: ['touchpoint', 'page_view', 'cta_click'],
});

// In the page:
// init({ endpoint: '/api/growth' })`;
}

/** Claude Code: add GrowthOS as a remote MCP server with a scoped API key. */
export function claudeCodeMcpAdd(ctx: DeveloperGuideContext): string {
  return `claude mcp add --transport http growthos ${trim(ctx.apiBase)}/v1/mcp \\
  --header "Authorization: Bearer $${GUIDE_KEY_ENV}"`;
}

/** A headless agent with the official MCP TypeScript SDK. */
export function mcpHeadlessSample(ctx: DeveloperGuideContext): string {
  return `import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(new URL('${trim(ctx.apiBase)}/v1/mcp'), {
  requestInit: { headers: { Authorization: \`Bearer \${process.env.${GUIDE_KEY_ENV}}\` } },
});
const client = new Client({ name: 'my-agent', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(tools.map((tool) => tool.name));

const check = await client.callTool({ name: 'check_installation', arguments: { expect: ['touchpoint', 'signup'] } });
console.log(check.content);
await client.close();`;
}

export function mcpEndpoint(ctx: DeveloperGuideContext): string {
  return `${trim(ctx.apiBase)}/v1/mcp`;
}
