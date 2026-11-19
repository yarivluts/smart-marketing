import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Audit log intro', () => {
  it('avoids developer words in English', () => {
    const text = en.AuditLog.heroDescription;
    expect(text).not.toMatch(/hash|chain|schema|tamper/i);
    expect(text).toMatch(/noticed/i);
  });

  it('is plain in Hebrew too', () => {
    const text = he.AuditLog.heroDescription;
    expect(text).not.toContain('גיבוב');
    expect(text).not.toContain('סכמות');
    expect(text.length).toBeGreaterThan(60);
  });
});
