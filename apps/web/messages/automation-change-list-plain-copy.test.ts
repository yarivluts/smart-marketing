import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'executeButton',
  'verifyButton',
  'verifyGuardedMetricBeforeLabel',
  'verifyGuardedMetricAfterLabel',
  'statusExecuted',
  'statusVerified',
  'violationAutomationPaused',
] as const;

describe('the AI change list buttons and statuses use plain words', () => {
  it('English avoids developer words', () => {
    for (const key of KEYS) expect(en.Automation[key], key).not.toMatch(/execut|verif|guarded|kill switch|engaged/i);
  });

  it('Hebrew has no English word', () => {
    for (const key of KEYS) expect(he.Automation[key], key).not.toMatch(/[A-Za-z]/);
  });

  it('the paused message tells people what to do next', () => {
    expect(en.Automation.violationAutomationPaused).toMatch(/turn them back on/i);
    expect(he.Automation.violationAutomationPaused).toMatch(/הפעילו/);
  });
});
