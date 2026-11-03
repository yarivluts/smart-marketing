import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('setup health billing requirement avoids raw event names', () => {
  it('en and he explain billing records without internal event names', () => {
    for (const m of [en, he as typeof en]) {
      expect(m.SetupHealth.requirements.billing.impact).not.toMatch(/subscription_state_change/);
    }
  });
});
