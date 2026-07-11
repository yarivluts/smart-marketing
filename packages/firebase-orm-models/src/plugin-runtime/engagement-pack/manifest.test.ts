import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import { ENGAGEMENT_PACK_MANIFEST_YAML, ENGAGEMENT_PACK_PLUGIN_ID } from './manifest';
import { ENGAGEMENT_PACK_FEATURED_METRIC_NAMES } from './metrics';

describe('ENGAGEMENT_PACK_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(ENGAGEMENT_PACK_MANIFEST_YAML);
    expect(manifest.id).toBe(ENGAGEMENT_PACK_PLUGIN_ID);
    expect(manifest.type).toBe('metric_pack');
    expect(manifest.scopes).toEqual(['metrics:write']);
    expect(manifest.configSchema).toEqual({});
    expect(manifest.registers.entities).toEqual([]);
    expect(manifest.registers.events).toEqual([]);
  });

  it("declares registers.metrics as exactly the five featured metric names KAN-63's AC lists, regardless of order", () => {
    const manifest = parsePluginManifest(ENGAGEMENT_PACK_MANIFEST_YAML);
    expect(new Set(manifest.registers.metrics)).toEqual(new Set(ENGAGEMENT_PACK_FEATURED_METRIC_NAMES));
    expect(manifest.registers.metrics).toHaveLength(5);
  });
});
