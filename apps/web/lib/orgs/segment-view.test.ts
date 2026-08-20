import { describe, expect, it } from 'vitest';
import type { SegmentModel } from '@growthos/firebase-orm-models';
import { buildSegmentMemberCountView, toSegmentSummaryView, type SegmentSummaryView } from './segment-view';

function segment(overrides: Partial<SegmentModel> & Pick<SegmentModel, 'id'>): SegmentModel {
  return {
    name: 'Paying, no demo',
    schema_name: 'customer',
    filters: [{ field: 'plan', op: '=', value: 'pro' }],
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as SegmentModel;
}

describe('toSegmentSummaryView', () => {
  it('projects a SegmentModel onto its list-page card shape', () => {
    const view: SegmentSummaryView = toSegmentSummaryView(segment({ id: 'segment-1' }));
    expect(view).toEqual({
      id: 'segment-1',
      name: 'Paying, no demo',
      schemaName: 'customer',
      filterCount: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
    });
  });
});

describe('buildSegmentMemberCountView', () => {
  it('maps a successful outcome to the ok/count shape', () => {
    expect(buildSegmentMemberCountView({ ok: true, count: 42 })).toEqual({ kind: 'ok', count: 42 });
  });

  it('maps each degraded outcome reason to its own render kind', () => {
    expect(buildSegmentMemberCountView({ ok: false, reason: 'warehouse_not_configured', message: 'not configured yet' })).toEqual({
      kind: 'warehouse_not_configured',
    });
    expect(buildSegmentMemberCountView({ ok: false, reason: 'quota_exceeded', message: 'quota is spent' })).toEqual({
      kind: 'quota_exceeded',
    });
    expect(buildSegmentMemberCountView({ ok: false, reason: 'query_error', message: 'table not found' })).toEqual({
      kind: 'query_error',
    });
  });
});
