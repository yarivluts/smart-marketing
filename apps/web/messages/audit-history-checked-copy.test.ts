import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['chainValid', 'chainBranchedTitle', 'chainBranchedDetails'] as const;

describe('the audit log status says the history was checked, not that a chain was verified', () => {
  it('uses everyday words in English', () => {
    for (const key of KEYS) {
      expect(en.AuditLog[key], key).not.toMatch(/chain|verified|tamper|branch/i);
    }
    expect(en.AuditLog.chainValid).toContain('History checked');
  });

  it('uses everyday words in Hebrew and keeps every placeholder', () => {
    for (const key of KEYS) {
      expect(he.AuditLog[key], key).not.toMatch(/שרשרת|השרשרת|מתפצל|אומתה/);
      expect(he.AuditLog[key].match(/\{[^}]*\}/g) ?? [], key).toEqual(en.AuditLog[key].match(/\{[^}]*\}/g) ?? []);
    }
  });
});
