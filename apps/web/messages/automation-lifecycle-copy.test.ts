import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Automation change-steps card uses plain words', () => {
  it('says safety limits, not guardrails or lifecycle (en)', () => {
    const { lifecycleTitle, lifecycleDescription } = en.Automation;
    expect(`${lifecycleTitle} ${lifecycleDescription}`).not.toMatch(/guardrail|lifecycle|executes|rolled back/i);
    expect(lifecycleDescription).toContain('safety limits');
    expect(lifecycleDescription).toContain('your approval');
  });

  it('says safety limits, not guardrails or life cycle (he)', () => {
    const { lifecycleTitle, lifecycleDescription } = he.Automation;
    expect(`${lifecycleTitle} ${lifecycleDescription}`).not.toMatch(/מעקות|מחזור החיים/);
    expect(lifecycleDescription).toContain('מגבלות הבטיחות');
  });
});
