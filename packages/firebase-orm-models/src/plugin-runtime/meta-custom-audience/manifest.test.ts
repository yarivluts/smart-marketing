import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import {
  META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD,
  META_CUSTOM_AUDIENCE_PLUGIN_ID,
  META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML,
} from './manifest';

describe('META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(META_CUSTOM_AUDIENCE_PLUGIN_MANIFEST_YAML);
    expect(manifest.id).toBe(META_CUSTOM_AUDIENCE_PLUGIN_ID);
    expect(manifest.type).toBe('action');
    expect(manifest.scopes).toEqual(['action:execute']);
    expect(manifest.configSchema).toEqual({
      [META_CUSTOM_AUDIENCE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: { type: 'string', required: true },
      [META_CUSTOM_AUDIENCE_NAME_CONFIG_FIELD]: { type: 'string', required: true },
    });
    expect(manifest.endpoints.action).toBe('./executor.ts');
  });
});
