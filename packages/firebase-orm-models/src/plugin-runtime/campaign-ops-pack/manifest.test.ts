import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_OPS_PACK_MANIFEST_YAML, CAMPAIGN_OPS_PACK_PLUGIN_ID } from './manifest';
import {
  CAMPAIGN_OPS_PACK_CALIBRATION_AGGREGATION_METRICS,
  CAMPAIGN_OPS_PACK_CALIBRATION_FORMULA_METRICS,
  CAMPAIGN_OPS_PACK_METRICS,
} from './metrics';

const ALL_PACK_METRIC_NAMES = [
  ...CAMPAIGN_OPS_PACK_METRICS,
  ...CAMPAIGN_OPS_PACK_CALIBRATION_AGGREGATION_METRICS,
  ...CAMPAIGN_OPS_PACK_CALIBRATION_FORMULA_METRICS,
].map((metric) => metric.name);

describe('CAMPAIGN_OPS_PACK_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(CAMPAIGN_OPS_PACK_MANIFEST_YAML);
    expect(manifest.id).toBe(CAMPAIGN_OPS_PACK_PLUGIN_ID);
    expect(manifest.type).toBe('metric_pack');
    expect(manifest.scopes).toEqual(['metrics:write']);
    expect(manifest.configSchema).toEqual({});
    expect(manifest.registers.entities).toEqual([]);
    expect(manifest.registers.events).toEqual([]);
  });

  it('declares registers.metrics as exactly the nine metric names this pack registers, regardless of order', () => {
    const manifest = parsePluginManifest(CAMPAIGN_OPS_PACK_MANIFEST_YAML);
    expect(new Set(manifest.registers.metrics)).toEqual(new Set(ALL_PACK_METRIC_NAMES));
    expect(manifest.registers.metrics).toHaveLength(9);
  });
});
