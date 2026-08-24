import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import { REP_COLLECTIONS_PACK_MANIFEST_YAML, REP_COLLECTIONS_PACK_PLUGIN_ID } from './manifest';
import { REP_COLLECTIONS_PACK_METRICS } from './metrics';

describe('REP_COLLECTIONS_PACK_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(REP_COLLECTIONS_PACK_MANIFEST_YAML);
    expect(manifest.id).toBe(REP_COLLECTIONS_PACK_PLUGIN_ID);
    expect(manifest.type).toBe('metric_pack');
    expect(manifest.scopes).toEqual(['metrics:write']);
    expect(manifest.configSchema).toEqual({});
    expect(manifest.registers.entities).toEqual([]);
    expect(manifest.registers.events).toEqual([]);
  });

  it('declares registers.metrics as exactly the one metric name this pack registers', () => {
    const manifest = parsePluginManifest(REP_COLLECTIONS_PACK_MANIFEST_YAML);
    expect(new Set(manifest.registers.metrics)).toEqual(new Set(REP_COLLECTIONS_PACK_METRICS.map((metric) => metric.name)));
    expect(manifest.registers.metrics).toHaveLength(1);
  });
});
