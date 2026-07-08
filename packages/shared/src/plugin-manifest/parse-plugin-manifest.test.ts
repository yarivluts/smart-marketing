import { describe, expect, it } from 'vitest';
import { parsePluginManifest } from './parse-plugin-manifest';
import { PluginManifestValidationError } from './types';

const VALID_MANIFEST = `
id: com.example.shopify-pack
version: 1.2.0
type: source
display_name: Shopify Commerce Pack
scopes: [ingest:write, schema:write]
config_schema:
  shop_domain: { type: string, required: true }
  max_backfill_days: { type: number }
registers:
  entities: [product, order]
  events: [order_completed, order_refunded]
  metrics: [aov, repeat_rate]
endpoints:
  sync: ./sync.ts
  action: ./act.ts
`;

describe('parsePluginManifest', () => {
  it('parses the plan doc\'s own example manifest (plan `12 §5`)', () => {
    const manifest = parsePluginManifest(VALID_MANIFEST);
    expect(manifest).toEqual({
      id: 'com.example.shopify-pack',
      version: '1.2.0',
      type: 'source',
      displayName: 'Shopify Commerce Pack',
      scopes: ['ingest:write', 'schema:write'],
      configSchema: {
        shop_domain: { type: 'string', required: true },
        max_backfill_days: { type: 'number', required: false },
      },
      registers: {
        entities: ['product', 'order'],
        events: ['order_completed', 'order_refunded'],
        metrics: ['aov', 'repeat_rate'],
      },
      endpoints: { sync: './sync.ts', action: './act.ts' },
    });
  });

  it('defaults registers/config_schema/endpoints to empty when omitted', () => {
    const manifest = parsePluginManifest(`
id: com.example.minimal
version: 1.0.0
type: ai_tool
display_name: Minimal Tool
scopes: [ai:tool]
`);
    expect(manifest.configSchema).toEqual({});
    expect(manifest.registers).toEqual({ entities: [], events: [], metrics: [] });
    expect(manifest.endpoints).toEqual({});
  });

  it('rejects malformed YAML', () => {
    expect(() => parsePluginManifest('id: [unterminated')).toThrow(PluginManifestValidationError);
  });

  it('rejects a non-map root', () => {
    expect(() => parsePluginManifest('- just\n- a\n- list')).toThrow(PluginManifestValidationError);
  });

  it('collects every validation reason at once rather than failing on the first', () => {
    try {
      parsePluginManifest(`
id: "Not A Valid Id"
version: not-semver
type: not_a_real_type
scopes: []
`);
      expect.fail('expected parsePluginManifest to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PluginManifestValidationError);
      const reasons = (err as InstanceType<typeof PluginManifestValidationError>).reasons;
      expect(reasons.some((reason) => reason.includes('`id`'))).toBe(true);
      expect(reasons.some((reason) => reason.includes('`version`'))).toBe(true);
      expect(reasons.some((reason) => reason.includes('Unknown `type`'))).toBe(true);
      expect(reasons.some((reason) => reason.includes('`display_name`'))).toBe(true);
      expect(reasons.some((reason) => reason.includes('`scopes`'))).toBe(true);
    }
  });

  it('rejects an unknown scope and a duplicated scope', () => {
    try {
      parsePluginManifest(`
id: com.example.bad-scopes
version: 1.0.0
type: source
display_name: Bad Scopes
scopes: [ingest:write, ingest:write, not:a:real:scope]
`);
      expect.fail('expected parsePluginManifest to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PluginManifestValidationError);
      const reasons = (err as InstanceType<typeof PluginManifestValidationError>).reasons;
      expect(reasons.some((reason) => reason.includes('more than once'))).toBe(true);
      expect(reasons.some((reason) => reason.includes('Unknown scope'))).toBe(true);
    }
  });

  it('rejects an invalid config_schema entry', () => {
    expect(() =>
      parsePluginManifest(`
id: com.example.bad-config
version: 1.0.0
type: source
display_name: Bad Config
scopes: [ingest:write]
config_schema:
  shop_domain: { type: not_a_real_type }
`),
    ).toThrow(PluginManifestValidationError);
  });

  it('rejects registers/endpoints fields that are not the expected shape', () => {
    expect(() =>
      parsePluginManifest(`
id: com.example.bad-registers
version: 1.0.0
type: source
display_name: Bad Registers
scopes: [ingest:write]
registers:
  entities: not-a-list
endpoints:
  sync: 123
`),
    ).toThrow(PluginManifestValidationError);
  });
});
