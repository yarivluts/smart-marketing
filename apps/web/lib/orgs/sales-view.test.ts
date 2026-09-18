import { describe, expect, it } from 'vitest';
import type { DemoFunnelResult } from '@growthos/firebase-orm-models';
import { toDemoFunnelView } from './sales-view';

describe('toDemoFunnelView', () => {
  it('resolves each row against the people map, preserving order and pass-through metrics', () => {
    const result: DemoFunnelResult = {
      demosScheduled: 4,
      demosHeld: 3,
      demosNoShow: 1,
      showRate: 0.75,
      sampledFrom: null,
      rows: [
        { repOrgPersonId: 'rep-1', demosHeld: 2, demosNoShow: 0, showRate: 1 },
        { repOrgPersonId: 'rep-2', demosHeld: 1, demosNoShow: 1, showRate: 0.5 },
      ],
    };
    const peopleById = new Map([
      ['rep-1', { name: 'Ada', photoUrl: 'https://example.com/ada.png' }],
      ['rep-2', { name: 'Grace', photoUrl: null }],
    ]);

    expect(toDemoFunnelView(result, peopleById)).toEqual({
      demosScheduled: 4,
      demosHeld: 3,
      demosNoShow: 1,
      showRate: 0.75,
      sampledFrom: null,
      rows: [
        { repOrgPersonId: 'rep-1', name: 'Ada', photoUrl: 'https://example.com/ada.png', demosHeld: 2, demosNoShow: 0, showRate: 1 },
        { repOrgPersonId: 'rep-2', name: 'Grace', photoUrl: null, demosHeld: 1, demosNoShow: 1, showRate: 0.5 },
      ],
    });
  });

  it('falls back to the raw rep id when the person was since removed from the org registry', () => {
    const result: DemoFunnelResult = {
      demosScheduled: 1,
      demosHeld: 1,
      demosNoShow: 0,
      showRate: 1,
      sampledFrom: null,
      rows: [{ repOrgPersonId: 'rep-removed', demosHeld: 1, demosNoShow: 0, showRate: 1 }],
    };

    const view = toDemoFunnelView(result, new Map());
    expect(view.rows[0]).toMatchObject({ name: 'rep-removed', photoUrl: null });
  });

  it('passes through a null project-wide show rate unchanged', () => {
    const result: DemoFunnelResult = { demosScheduled: 2, demosHeld: 0, demosNoShow: 0, showRate: null, rows: [], sampledFrom: null };
    expect(toDemoFunnelView(result, new Map()).showRate).toBeNull();
  });
  /**
   * `sampledFrom` has to survive the mapping, because the page decides whether
   * to qualify every number on it from this one field. Dropping it here would
   * restore the exact defect (KAN-164) while every other assertion above
   * stayed green — the counts map correctly whether or not they are complete.
   */
  it('carries the sampling cap through to the view', () => {
    const sampled: DemoFunnelResult = {
      demosScheduled: 500,
      demosHeld: 300,
      demosNoShow: 100,
      showRate: 0.75,
      rows: [{ repOrgPersonId: 'rep-1', demosHeld: 300, demosNoShow: 100, showRate: 0.75 }],
      sampledFrom: 500,
    };
    expect(toDemoFunnelView(sampled, new Map()).sampledFrom).toBe(500);
  });
});
