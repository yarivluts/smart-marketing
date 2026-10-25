import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const REASONS = ['not_attached', 'read_only', 'no_secret'] as const;

describe('Ad Studio "cannot send to your ad account" messages', () => {
  it('en: say what is wrong in plain words and point at Ad platform connections', () => {
    for (const reason of REASONS) {
      const text = en.AdStudio.exportUnavailable[reason];
      expect(text).toMatch(/Ad platform connections/);
      expect(text).not.toMatch(/credential|attached|write level|org admin|read-only/i);
    }
  });

  it('he: same next step, no developer words', () => {
    for (const reason of REASONS) {
      const text = he.AdStudio.exportUnavailable[reason];
      expect(text).toMatch(/חיבורי פלטפורמות הפרסום/);
      expect(text).not.toMatch(/הרשאות כתיבה|רמת הכתיבה|פרטי גישה|קריאה בלבד/);
    }
  });
});
