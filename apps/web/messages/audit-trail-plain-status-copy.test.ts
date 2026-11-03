import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const CODES = ['awaiting_approval', 'approved', 'executed', 'verified', 'rolled_back', 'failed', 'rejected', 'unknown'] as const;

describe('the changes list shows plain status words', () => {
  it('has a label for every status in both languages, with no raw code', () => {
    for (const code of CODES) {
      const key = `status_${code}` as keyof typeof en.ActionAuditTrail;
      expect(en.ActionAuditTrail[key], key).toBeTruthy();
      expect(en.ActionAuditTrail[key]).not.toContain('_');
      expect(he.ActionAuditTrail[key], key).toBeTruthy();
      expect(he.ActionAuditTrail[key].replace(/\{[^}]*\}/g, '')).not.toMatch(/[A-Za-z_]/);
    }
  });
});
