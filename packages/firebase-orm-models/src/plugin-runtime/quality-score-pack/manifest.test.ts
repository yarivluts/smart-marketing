import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import { QUALITY_SCORE_PACK_MANIFEST_YAML, QUALITY_SCORE_PACK_PLUGIN_ID } from './manifest';
import { QUALITY_SCORE_PACK_METRICS } from './metrics';

describe('QUALITY_SCORE_PACK_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(QUALITY_SCORE_PACK_MANIFEST_YAML);
    expect(manifest.id).toBe(QUALITY_SCORE_PACK_PLUGIN_ID);
    expect(manifest.type).toBe('metric_pack');
    expect(manifest.scopes).toEqual(['metrics:write', 'schema:write']);
    expect(manifest.configSchema).toEqual({});
    expect(manifest.registers.entities).toEqual([]);
    expect(manifest.registers.events).toEqual([]);
  });

  it('declares registers.metrics as every metric this pack defines, except the reused ad_spend (see the manifest\'s own doc comment)', () => {
    const manifest = parsePluginManifest(QUALITY_SCORE_PACK_MANIFEST_YAML);
    const definedNames = new Set(QUALITY_SCORE_PACK_METRICS.map((metric) => metric.name).filter((name) => name !== 'ad_spend'));
    expect(new Set(manifest.registers.metrics)).toEqual(definedNames);
    expect(manifest.registers.metrics).not.toContain('ad_spend');
    expect(manifest.registers.metrics).toHaveLength(9);
  });
});
