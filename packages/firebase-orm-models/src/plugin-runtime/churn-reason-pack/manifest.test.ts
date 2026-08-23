import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import { CHURN_REASON_PACK_MANIFEST_YAML, CHURN_REASON_PACK_PLUGIN_ID } from './manifest';
import { CHURN_REASON_PACK_METRICS } from './metrics';

describe('CHURN_REASON_PACK_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(CHURN_REASON_PACK_MANIFEST_YAML);
    expect(manifest.id).toBe(CHURN_REASON_PACK_PLUGIN_ID);
    expect(manifest.type).toBe('metric_pack');
    expect(manifest.scopes).toEqual(['metrics:write', 'schema:write']);
    expect(manifest.configSchema).toEqual({});
    expect(manifest.registers.entities).toEqual([]);
    expect(manifest.registers.events).toEqual([]);
  });

  it('declares registers.metrics as exactly the metric names this pack registers, regardless of order', () => {
    const manifest = parsePluginManifest(CHURN_REASON_PACK_MANIFEST_YAML);
    expect(new Set(manifest.registers.metrics)).toEqual(new Set(CHURN_REASON_PACK_METRICS.map((metric) => metric.name)));
    expect(manifest.registers.metrics).toHaveLength(1);
  });
});
