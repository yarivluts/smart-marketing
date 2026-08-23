import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import { CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD, CRM_WEBHOOK_PLUGIN_ID, CRM_WEBHOOK_PLUGIN_MANIFEST_YAML } from './manifest';

describe('CRM_WEBHOOK_PLUGIN_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(CRM_WEBHOOK_PLUGIN_MANIFEST_YAML);
    expect(manifest.id).toBe(CRM_WEBHOOK_PLUGIN_ID);
    expect(manifest.type).toBe('action');
    expect(manifest.scopes).toEqual(['action:execute']);
    expect(manifest.configSchema).toEqual({
      [CRM_WEBHOOK_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: { type: 'string', required: true },
    });
    expect(manifest.endpoints.action).toBe('./push.ts');
  });
});
