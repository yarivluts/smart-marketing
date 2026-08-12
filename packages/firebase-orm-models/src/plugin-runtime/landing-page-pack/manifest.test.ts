import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import { LANDING_PAGE_PACK_MANIFEST_YAML, LANDING_PAGE_PACK_PLUGIN_ID } from './manifest';
import { LANDING_PAGE_PACK_METRIC_NAMES } from './metrics';

describe('LANDING_PAGE_PACK_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(LANDING_PAGE_PACK_MANIFEST_YAML);
    expect(manifest.id).toBe(LANDING_PAGE_PACK_PLUGIN_ID);
    expect(manifest.type).toBe('metric_pack');
    expect(manifest.scopes).toEqual(['metrics:write']);
    expect(manifest.configSchema).toEqual({});
    expect(manifest.registers.entities).toEqual([]);
    expect(manifest.registers.events).toEqual([]);
  });

  it('declares registers.metrics as exactly the metrics the pack actually defines', () => {
    const manifest = parsePluginManifest(LANDING_PAGE_PACK_MANIFEST_YAML);
    expect(new Set(manifest.registers.metrics)).toEqual(new Set(LANDING_PAGE_PACK_METRIC_NAMES));
    expect(manifest.registers.metrics).toHaveLength(3);
  });
});
