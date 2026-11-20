import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the audit log empty hint speaks plainly', () => {
  it('English names things the way the page hero does, without "board" or "schema"', () => {
    expect(en.AuditLog.noEntriesHint).not.toMatch(/board|schema/i);
    expect(en.AuditLog.noEntriesHint).toMatch(/access key/i);
  });

  it('Hebrew drops "סכמה" and "לוח" for the plain words', () => {
    expect(he.AuditLog.noEntriesHint).not.toMatch(/סכמה|לוח/);
    expect(he.AuditLog.noEntriesHint).toMatch(/שדה נתונים/);
  });
});
