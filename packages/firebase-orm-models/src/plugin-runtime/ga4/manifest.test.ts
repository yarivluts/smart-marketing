import { describe, expect, it } from 'vitest';
import { parsePluginManifest } from '@growthos/shared';
import { GA4_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD, GA4_PLUGIN_ID, GA4_PLUGIN_MANIFEST_YAML, GA4_PROPERTY_ID_CONFIG_FIELD } from './manifest';

describe('GA4_PLUGIN_MANIFEST_YAML', () => {
  it('parses as a valid source-type manifest declaring both config fields and its two event schemas', () => {
    const manifest = parsePluginManifest(GA4_PLUGIN_MANIFEST_YAML);
    expect(manifest.id).toBe(GA4_PLUGIN_ID);
    expect(manifest.type).toBe('source');
    expect(manifest.scopes).toEqual(['ingest:write', 'schema:write']);
    expect(manifest.configSchema[GA4_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]).toEqual({ type: 'string', required: true });
    expect(manifest.configSchema[GA4_PROPERTY_ID_CONFIG_FIELD]).toEqual({ type: 'string', required: true });
    expect(manifest.registers.events).toEqual(['ga4_session', 'ga4_event']);
  });
});
