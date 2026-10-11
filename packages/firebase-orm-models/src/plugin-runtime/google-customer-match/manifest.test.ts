import { parsePluginManifest } from '@growthos/shared';
import { describe, expect, it } from 'vitest';
import {
  GOOGLE_CUSTOMER_MATCH_AD_PERSONALIZATION_CONSENT_CONFIG_FIELD,
  GOOGLE_CUSTOMER_MATCH_AD_USER_DATA_CONSENT_CONFIG_FIELD,
  GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD,
  GOOGLE_CUSTOMER_MATCH_NAME_CONFIG_FIELD,
  GOOGLE_CUSTOMER_MATCH_PLUGIN_ID,
  GOOGLE_CUSTOMER_MATCH_PLUGIN_MANIFEST_YAML,
} from './manifest';

describe('GOOGLE_CUSTOMER_MATCH_PLUGIN_MANIFEST_YAML', () => {
  it('parses as a valid plugin manifest (the exact registerPluginManifest input path)', () => {
    const manifest = parsePluginManifest(GOOGLE_CUSTOMER_MATCH_PLUGIN_MANIFEST_YAML);
    expect(manifest.id).toBe(GOOGLE_CUSTOMER_MATCH_PLUGIN_ID);
    expect(manifest.type).toBe('action');
    expect(manifest.scopes).toEqual(['action:execute']);
    expect(manifest.configSchema).toEqual({
      [GOOGLE_CUSTOMER_MATCH_CREDENTIAL_ATTACHMENT_ID_CONFIG_FIELD]: { type: 'string', required: true },
      [GOOGLE_CUSTOMER_MATCH_NAME_CONFIG_FIELD]: { type: 'string', required: true },
      // KAN-236: optional, so an unanswered consent is simply not sent.
      [GOOGLE_CUSTOMER_MATCH_AD_USER_DATA_CONSENT_CONFIG_FIELD]: { type: 'enum', required: false, values: ['GRANTED', 'DENIED'] },
      [GOOGLE_CUSTOMER_MATCH_AD_PERSONALIZATION_CONSENT_CONFIG_FIELD]: { type: 'enum', required: false, values: ['GRANTED', 'DENIED'] },
    });
    expect(manifest.endpoints.action).toBe('./executor.ts');
  });
});
