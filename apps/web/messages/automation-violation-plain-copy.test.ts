import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'violationMaxDailyChangePct',
  'violationSpendCeiling',
  'violationProtectedTarget',
  'violationOutsideAllowedHours',
  'violationBlastRadius',
  'violationInsufficientWriteTier',
] as const;

describe('the reasons automation refuses a change use plain words', () => {
  it('English avoids developer and marketing words', () => {
    for (const key of KEYS) {
      expect(en.Automation[key], key).not.toMatch(/\btarget\b|\btier\b|ceiling|\bpct\b|window|Optimize|Manage/i);
    }
  });

  it('Hebrew has no English word', () => {
    for (const key of KEYS) expect(he.Automation[key], key).not.toMatch(/[A-Za-z]/);
  });

  it('the access message says what to do next', () => {
    expect(en.Automation.violationInsufficientWriteTier).toMatch(/more access/i);
    // "give it a wider permission"
    expect(he.Automation.violationInsufficientWriteTier).toMatch(/תנו לו הרשאה/);
  });

  it('the daily limit message says when to try again', () => {
    expect(en.Automation.violationBlastRadius).toMatch(/tomorrow/i);
    expect(he.Automation.violationBlastRadius).toMatch(/מחר/);
  });
});
