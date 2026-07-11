import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import { SAAS_METRIC_PACK_MANIFEST_YAML, SAAS_METRIC_PACK_PLUGIN_ID } from './manifest';
import { SAAS_METRIC_PACK_FEATURED_METRIC_NAMES } from './metrics';

describe('SAAS_METRIC_PACK_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(SAAS_METRIC_PACK_MANIFEST_YAML);
    expect(manifest.id).toBe(SAAS_METRIC_PACK_PLUGIN_ID);
    expect(manifest.type).toBe('metric_pack');
    expect(manifest.scopes).toEqual(['metrics:write']);
    expect(manifest.configSchema).toEqual({});
    expect(manifest.registers.entities).toEqual([]);
    expect(manifest.registers.events).toEqual([]);
  });

  it('declares registers.metrics as exactly the eleven featured metric names KAN-59\'s AC lists, regardless of order', () => {
    const manifest = parsePluginManifest(SAAS_METRIC_PACK_MANIFEST_YAML);
    expect(new Set(manifest.registers.metrics)).toEqual(new Set(SAAS_METRIC_PACK_FEATURED_METRIC_NAMES));
    expect(manifest.registers.metrics).toHaveLength(11);
  });
});
