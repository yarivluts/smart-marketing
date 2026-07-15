import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import { META_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD, META_MANAGE_PLUGIN_ID, META_MANAGE_PLUGIN_MANIFEST_YAML } from './manifest';

describe('META_MANAGE_PLUGIN_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(META_MANAGE_PLUGIN_MANIFEST_YAML);
    expect(manifest.id).toBe(META_MANAGE_PLUGIN_ID);
    expect(manifest.type).toBe('action');
    expect(manifest.scopes).toEqual(['action:execute']);
    expect(manifest.configSchema).toEqual({
      [META_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: { type: 'string', required: true },
    });
    expect(manifest.endpoints.action).toBe('./executor.ts');
  });
});
