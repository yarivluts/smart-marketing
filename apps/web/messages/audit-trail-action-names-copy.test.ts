import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Trail = Record<string, string>;
const trail = (m: unknown) => (m as { ActionAuditTrail: Trail }).ActionAuditTrail;

describe('Action history: plain action names', () => {
  it('en: no bidding or status jargon', () => {
    expect(trail(en).actionType_bid_strategy_change).not.toMatch(/strategy|bid/i);
    expect(trail(en).actionType_status_toggle).not.toMatch(/toggle|status/i);
    expect(trail(en).actionType_status_toggle).toBe('Ad turned on or off');
  });

  it('he: no strategy or status jargon', () => {
    // Hebrew words by code point: אסטרטגיה, סטטוס.
    const strategy = 'אסטרטגי';
    const status = 'סטטוס';
    expect(trail(he).actionType_bid_strategy_change).not.toContain(strategy);
    expect(trail(he).actionType_status_toggle).not.toContain(status);
    expect(trail(he).actionType_bid_strategy_change.length).toBeGreaterThan(0);
  });
});
