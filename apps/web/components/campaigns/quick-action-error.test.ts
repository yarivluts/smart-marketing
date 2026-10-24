import { describe, expect, it } from 'vitest';
import { GUARDRAIL_VIOLATION_TYPES } from '@growthos/shared';
import en from '../../messages/en.json';
import he from '../../messages/he.json';
import { quickActionErrorKey } from './quick-action-error';

describe('quickActionErrorKey', () => {
  it('maps every guardrail violation type to its own sentence', () => {
    for (const type of GUARDRAIL_VIOLATION_TYPES) {
      expect(quickActionErrorKey(422, { violations: [{ type }] })).not.toBe('guardrailGeneric');
    }
  });

  it('falls back to a generic safety sentence for an unknown violation', () => {
    expect(quickActionErrorKey(422, { violations: [{ type: 'brand_new' }] })).toBe('guardrailGeneric');
    expect(quickActionErrorKey(422, null)).toBe('guardrailGeneric');
  });

  it('explains permission, paused and not-connected failures instead of showing codes', () => {
    expect(quickActionErrorKey(403, {})).toBe('quickActionPermissionDenied');
    expect(quickActionErrorKey(409, { error: 'kill_switch_engaged' })).toBe('guardrailPaused');
    expect(quickActionErrorKey(409, { error: 'meta_ads_credential_not_configured' })).toBe('quickActionNotConnected');
    expect(quickActionErrorKey(500, { error: 'boom', message: 'Internal' })).toBe('quickActionError');
  });

  it('has every returned key in both languages, with no raw codes in the text', () => {
    const keys = new Set<string>();
    for (const type of GUARDRAIL_VIOLATION_TYPES) keys.add(quickActionErrorKey(422, { violations: [{ type }] }));
    keys.add(quickActionErrorKey(422, null));
    keys.add(quickActionErrorKey(403, null));
    keys.add(quickActionErrorKey(409, { error: 'meta_plugin_not_installed' }));
    keys.add(quickActionErrorKey(500, null));
    for (const messages of [en, he]) {
      const ns = messages.Campaigns as unknown as Record<string, string>;
      for (const key of keys) {
        expect(ns[key], key).toBeTruthy();
        expect(ns[key]).not.toMatch(/_/);
      }
    }
  });
});
