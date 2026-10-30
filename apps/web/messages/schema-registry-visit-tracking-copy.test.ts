import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Registry = { touchpointCaptureHeading: string; noSchemasDetail: string };
const reg = (m: unknown) => (m as { SchemaRegistry: Registry }).SchemaRegistry;

describe('Schema Registry speaks of website visit tracking', () => {
  it('en does not say touchpoint capture', () => {
    for (const t of [reg(en).touchpointCaptureHeading, reg(en).noSchemasDetail]) {
      expect(t).not.toMatch(/touchpoint/i);
    }
    expect(reg(en).touchpointCaptureHeading).toBe('Website visit tracking');
    expect(reg(en).noSchemasDetail).toContain('website visit tracking');
  });
  it('he uses plain words and matches the setup button', () => {
    for (const t of [reg(he).touchpointCaptureHeading, reg(he).noSchemasDetail]) {
      expect(t).not.toContain('נקודות מגע');
      expect(t).toContain('ביקורים באתר');
    }
  });
});
