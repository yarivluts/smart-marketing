import { describe, expect, it } from 'vitest';
import he from './he.json';

// The hint inside the "conversion event" box spoke to one person ("leave blank", "name") while the rest of
// the app speaks to a group. Written as escapes: Hebrew stays out of code files.
const SINGULAR_LEAVE = /השאר ריק/;
const SINGULAR_NAME = /או ציין /;

describe('Hebrew cohort conversion-event hint speaks in the plural', () => {
  const text = (he as unknown as { CohortRetention: Record<string, string> }).CohortRetention
    .conversionEventPlaceholder;

  it('does not use the singular imperatives', () => {
    expect(text).not.toMatch(SINGULAR_LEAVE);
    expect(text).not.toMatch(SINGULAR_NAME);
  });

  it('uses the plural imperatives and keeps the example', () => {
    expect(text).toContain('השאירו ריק');
    expect(text).toContain('ציינו');
    expect(text).toContain('purchase');
  });
});
