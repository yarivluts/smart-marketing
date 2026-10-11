import { describe, expect, it } from 'vitest';
import { TOUCHPOINT_SCHEMA_FIELDS } from '../touchpoint-capture/touchpoint-schema';
import {
  GUIDE_EXPECTED_SCHEMAS,
  GUIDE_SCHEMA_MANIFEST,
  browserNpmSample,
  claudeCodeMcpAdd,
  curlApplySchemaManifest,
  curlIngest,
  curlMcp,
  curlMetrics,
  curlVerify,
  mcpHeadlessSample,
  nodeInstall,
  nodeServerSample,
  relaySample,
  sampleEntitiesBody,
  sampleEventsBody,
  sampleMeasuresBody,
  sampleMetricQueryBody,
  type DeveloperGuideContext,
} from './samples';

const ctx: DeveloperGuideContext = {
  apiBase: 'https://api.test/',
  appBase: 'https://app.test',
  nodeSdkVersion: '0.1.1',
  browserSdkVersion: '0.1.1',
};
const now = new Date('2026-10-11T09:00:00.000Z');

describe('developer guide samples', () => {
  it('builds every URL from the real API base, without a doubled slash', () => {
    expect(curlIngest(ctx, 'events', now)).toContain('https://api.test/v1/ingest/events');
    expect(curlVerify(ctx)).toContain('https://api.test/v1/ingest/verify?expect=touchpoint,signup,cta_click,customer,mrr');
    expect(curlMetrics(ctx, now)).toContain('https://api.test/v1/metrics/query');
    expect(curlMcp(ctx, 'tools/list')).toContain('https://api.test/v1/mcp');
    expect(claudeCodeMcpAdd(ctx)).toContain('https://api.test/v1/mcp');
    expect(nodeInstall(ctx)).toBe('npm install https://app.test/sdk/v1/growthos-node-0.1.1.tgz');
    for (const sample of [curlIngest(ctx, 'events', now), curlVerify(ctx), nodeServerSample(ctx), relaySample(ctx)]) {
      expect(sample).not.toContain('api.test//');
    }
  });

  it('never inlines a secret key: server samples read GROWTHOS_API_KEY', () => {
    const serverSamples = [
      curlIngest(ctx, 'events', now),
      curlIngest(ctx, 'entities', now),
      curlIngest(ctx, 'measures', now),
      curlVerify(ctx),
      curlMetrics(ctx, now),
      curlMcp(ctx, 'tools/list'),
      curlApplySchemaManifest(ctx),
      nodeServerSample(ctx),
      relaySample(ctx),
      claudeCodeMcpAdd(ctx),
      mcpHeadlessSample(ctx),
    ];
    for (const sample of serverSamples) {
      expect(sample).toMatch(/GROWTHOS_API_KEY/);
      expect(sample).not.toMatch(/gos_(live|test)_[A-Za-z0-9]{6,}/);
    }
    // The browser key is public by design; without one the sample shows a test-key placeholder.
    expect(browserNpmSample(ctx)).toContain("key: 'gos_pk_test_...'");
    expect(browserNpmSample({ ...ctx, browserKey: 'gos_pk_test_ab12' })).toContain("key: 'gos_pk_test_ab12'");
  });

  it('sends bodies in the exact ingest wire shapes', () => {
    const events = sampleEventsBody(now);
    expect(Object.keys(events)).toEqual(['batch']);
    expect(Object.keys(events.batch[0]).sort()).toEqual(['event', 'event_id', 'properties', 'ts']);
    expect(events.batch[0].properties).toMatchObject({ customer_id: 'user_123', anon_id: expect.any(String) });

    const entities = sampleEntitiesBody(now);
    expect(entities.type).toBe('customer');
    expect(Object.keys(entities.records[0]).sort()).toEqual(['attributes', 'id']);

    const measures = sampleMeasuresBody(now);
    expect(measures.records[0]).toEqual({ measure: 'mrr', ts: '2026-10-11', value: 49, dimensions: { plan: 'pro' } });

    expect(sampleMetricQueryBody(now)).toEqual({ metric: 'signups', time: { start: '2026-09-12', end: '2026-10-11', grain: 'day' } });
  });

  it('only sends fields the guide manifest declares, so nothing is quarantined', () => {
    const declared = (name: string) =>
      new Set(GUIDE_SCHEMA_MANIFEST.schemas.find((schema) => schema.name === name)!.fields.map((field) => field.name));
    const implicit = new Set(['anon_id', 'customer_id']);
    for (const key of Object.keys(sampleEventsBody(now).batch[0].properties)) {
      expect(declared('signup').has(key) || implicit.has(key)).toBe(true);
    }
    for (const key of Object.keys(sampleEntitiesBody(now).records[0].attributes)) expect(declared('customer').has(key)).toBe(true);
    for (const key of Object.keys(sampleMeasuresBody(now).records[0].dimensions)) expect(declared('mrr').has(key)).toBe(true);
    // Every expected schema is in the manifest.
    expect(GUIDE_SCHEMA_MANIFEST.schemas.map((schema) => schema.name).sort()).toEqual([...GUIDE_EXPECTED_SCHEMAS].sort());
  });

  it('registers touchpoint with exactly the canonical GrowthOS field list', () => {
    const touchpoint = GUIDE_SCHEMA_MANIFEST.schemas.find((schema) => schema.name === 'touchpoint')!;
    expect(touchpoint.fields.map((field) => field.name)).toEqual(TOUCHPOINT_SCHEMA_FIELDS.map((field) => field.name));
  });

  it('wraps the manifest in an apply_schema_manifest tool call', () => {
    const call = curlApplySchemaManifest(ctx);
    const body = JSON.parse(call.slice(call.indexOf("-d '") + 4, call.lastIndexOf("'")));
    expect(body).toMatchObject({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'apply_schema_manifest' } });
    expect(body.params.arguments.schemas).toHaveLength(GUIDE_SCHEMA_MANIFEST.schemas.length);
  });
});

describe('schemaManifestJson', () => {
  it('is valid JSON equal to the manifest, with one line per field', async () => {
    const { schemaManifestJson } = await import('./samples');
    const text = schemaManifestJson();
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(GUIDE_SCHEMA_MANIFEST)));
    expect(text).toContain('{"name": "click_id", "type": "string", "is_identity_key": true}');
    // One line per field plus a few per schema: about 50, against about 150 for plain JSON.
    expect(text.split('\n').length).toBeLessThan(60);
  });
});
