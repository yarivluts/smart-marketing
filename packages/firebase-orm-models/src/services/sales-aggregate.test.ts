import { describe, expect, it } from 'vitest';
import { aggregateDemoFunnel } from './sales.service';
import type { RawRecordModel } from '../models/raw-record.model';

/**
 * Pure-function tests for `aggregateDemoFunnel` (KAN-92) — no Firestore
 * access, same "brute-force edge cases without the emulator" posture
 * `support-aggregate.test.ts` (KAN-90) establishes for its own pure
 * aggregator.
 */

function demoEvent(properties: Record<string, unknown>): RawRecordModel {
  return { payload: { event: 'demo_event', event_id: 'evt', ts: '2026-09-01T00:00:00.000Z', properties } } as RawRecordModel;
}

describe('aggregateDemoFunnel', () => {
  it('counts distinct scheduled/held/no-show demos and computes the project-wide show rate', () => {
    const result = aggregateDemoFunnel([
      demoEvent({ demo_id: 'd1', stage: 'scheduled' }),
      demoEvent({ demo_id: 'd1', stage: 'held', rep_org_person_id: 'rep_1' }),
      demoEvent({ demo_id: 'd2', stage: 'scheduled' }),
      demoEvent({ demo_id: 'd2', stage: 'no_show', rep_org_person_id: 'rep_1' }),
    ]);

    expect(result.demosScheduled).toBe(2);
    expect(result.demosHeld).toBe(1);
    expect(result.demosNoShow).toBe(1);
    expect(result.showRate).toBe(0.5);
  });

  it('buckets held/no-show outcomes by rep', () => {
    const result = aggregateDemoFunnel([
      demoEvent({ demo_id: 'd1', stage: 'held', rep_org_person_id: 'rep_1' }),
      demoEvent({ demo_id: 'd2', stage: 'held', rep_org_person_id: 'rep_1' }),
      demoEvent({ demo_id: 'd3', stage: 'no_show', rep_org_person_id: 'rep_2' }),
    ]);

    expect(result.rows).toEqual([
      { repOrgPersonId: 'rep_1', demosHeld: 2, demosNoShow: 0, showRate: 1 },
      { repOrgPersonId: 'rep_2', demosHeld: 0, demosNoShow: 1, showRate: 0 },
    ]);
  });

  it('sorts rows highest-demosHeld-first', () => {
    const result = aggregateDemoFunnel([
      demoEvent({ demo_id: 'd1', stage: 'held', rep_org_person_id: 'rep_low' }),
      demoEvent({ demo_id: 'd2', stage: 'held', rep_org_person_id: 'rep_high' }),
      demoEvent({ demo_id: 'd3', stage: 'held', rep_org_person_id: 'rep_high' }),
    ]);

    expect(result.rows.map((row) => row.repOrgPersonId)).toEqual(['rep_high', 'rep_low']);
  });

  it('excludes canceled demos from every count', () => {
    const result = aggregateDemoFunnel([
      demoEvent({ demo_id: 'd1', stage: 'scheduled' }),
      demoEvent({ demo_id: 'd1', stage: 'canceled', rep_org_person_id: 'rep_1' }),
    ]);

    expect(result.demosScheduled).toBe(1);
    expect(result.demosHeld).toBe(0);
    expect(result.demosNoShow).toBe(0);
    expect(result.showRate).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it('reports a null show rate (project-wide and per-rep) when neither held nor no-show has happened yet', () => {
    const result = aggregateDemoFunnel([demoEvent({ demo_id: 'd1', stage: 'scheduled' })]);

    expect(result.showRate).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it('ignores a held/no-show event with no rep_org_person_id for per-rep rows, but still counts it toward funnel totals', () => {
    const result = aggregateDemoFunnel([demoEvent({ demo_id: 'd1', stage: 'held' })]);

    expect(result.demosHeld).toBe(1);
    expect(result.showRate).toBe(1);
    expect(result.rows).toEqual([]);
  });

  it('ignores malformed records (missing demo_id or an unrecognized stage) without crashing', () => {
    const result = aggregateDemoFunnel([
      demoEvent({ stage: 'held' }),
      demoEvent({ demo_id: 'd1', stage: 'in_progress' }),
      { payload: { properties: null } } as RawRecordModel,
      { payload: { properties: 'not-an-object' } } as RawRecordModel,
    ]);

    expect(result.demosScheduled).toBe(0);
    expect(result.demosHeld).toBe(0);
    expect(result.demosNoShow).toBe(0);
    expect(result.rows).toEqual([]);
  });
});
