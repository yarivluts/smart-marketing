import { describe, expect, it } from 'vitest';
import { toTrackingAlertView, trackingAlertStatusLabelKey } from './tracking-alert-view';
import type { TrackingAlertModel } from '@growthos/firebase-orm-models';

function alert(overrides: Partial<TrackingAlertModel> & Pick<TrackingAlertModel, 'id' | 'status'>): TrackingAlertModel {
  return {
    schema_name: 'order_completed',
    detected_at: '2026-07-08T10:00:00.000Z',
    last_seen_at: '2026-07-08T09:00:00.000Z',
    last_checked_at: '2026-07-08T10:00:00.000Z',
    resolved_at: undefined,
    ...overrides,
  } as TrackingAlertModel;
}

describe('toTrackingAlertView', () => {
  it('maps every field, including a defined resolvedAt', () => {
    const view = toTrackingAlertView(alert({ id: 'a1', status: 'resolved', resolved_at: '2026-07-08T11:00:00.000Z' }));
    expect(view).toEqual({
      id: 'a1',
      schemaName: 'order_completed',
      status: 'resolved',
      detectedAt: '2026-07-08T10:00:00.000Z',
      lastSeenAt: '2026-07-08T09:00:00.000Z',
      lastCheckedAt: '2026-07-08T10:00:00.000Z',
      resolvedAt: '2026-07-08T11:00:00.000Z',
    });
  });

  it('maps a missing resolvedAt to null, not undefined', () => {
    const view = toTrackingAlertView(alert({ id: 'a2', status: 'active' }));
    expect(view.resolvedAt).toBeNull();
  });
});

describe('trackingAlertStatusLabelKey', () => {
  it('maps each status to its own distinct translation key', () => {
    expect(trackingAlertStatusLabelKey('active')).toBe('trackingAlertStatusActive');
    expect(trackingAlertStatusLabelKey('resolved')).toBe('trackingAlertStatusResolved');
  });
});
