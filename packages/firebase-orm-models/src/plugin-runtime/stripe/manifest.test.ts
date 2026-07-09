import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import { STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD, STRIPE_PLUGIN_ID, STRIPE_PLUGIN_MANIFEST_YAML } from './manifest';

describe('STRIPE_PLUGIN_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(STRIPE_PLUGIN_MANIFEST_YAML);
    expect(manifest.id).toBe(STRIPE_PLUGIN_ID);
    expect(manifest.type).toBe('source');
    expect(manifest.scopes).toEqual(['ingest:write', 'schema:write']);
    expect(manifest.configSchema).toEqual({
      [STRIPE_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: { type: 'string', required: true },
    });
    expect(manifest.registers.entities).toEqual(['stripe_subscription']);
    expect(manifest.registers.events).toEqual(['stripe_charge', 'stripe_invoice', 'stripe_refund', 'stripe_failed_payment']);
  });
});
