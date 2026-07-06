import { describe, expect, it } from 'vitest';
import {
  computeIngestHealthSummary,
  DEFAULT_QUARANTINE_BROWSER_LIMIT,
  formatMinutesAgo,
  formatThroughput,
  type IngestBatchView,
} from './ingest-health-view';

const NOW = Date.parse('2026-07-06T12:00:00Z');

function batch(overrides: Partial<IngestBatchView> & Pick<IngestBatchView, 'id' | 'createdAt'>): IngestBatchView {
  return {
    kind: 'event',
    environmentId: 'env-prod',
    totalCount: 0,
    acceptedCount: 0,
    quarantinedCount: 0,
    duplicateCount: 0,
    recordResults: [],
    ...overrides,
  };
}

describe('computeIngestHealthSummary', () => {
  it('returns all-zero, null-freshness rollups for a project with no batches yet', () => {
    const summary = computeIngestHealthSummary([], NOW);
    expect(summary.overall).toMatchObject({ batchCount: 0, totalRecords: 0, errorRatePercent: 0, latestBatchAt: null, freshnessMinutes: null });
    expect(summary.byKind).toEqual([]);
    expect(summary.quarantinedRecords).toEqual([]);
    expect(summary.quarantinedRecordsTruncated).toBe(false);
  });

  it('sums accepted/quarantined/duplicate counts', () => {
    const batches = [
      batch({
        id: 'b1',
        createdAt: '2026-07-06T11:58:00Z',
        totalCount: 4,
        acceptedCount: 2,
        quarantinedCount: 1,
        duplicateCount: 1,
      }),
    ];

    const summary = computeIngestHealthSummary(batches, NOW);
    expect(summary.overall.totalRecords).toBe(4);
    expect(summary.overall.acceptedCount).toBe(2);
    expect(summary.overall.quarantinedCount).toBe(1);
    expect(summary.overall.duplicateCount).toBe(1);
  });

  it('computes error rate from quarantined records only, excluding benign duplicates', () => {
    // A batch that's 100% duplicate (e.g. a client retry storm after a
    // timeout) is not a data-quality error and must not read as "100% error
    // rate" — only genuine validation failures (quarantined) count.
    const allDuplicates = batch({ id: 'b1', createdAt: '2026-07-06T11:58:00Z', totalCount: 4, duplicateCount: 4 });
    expect(computeIngestHealthSummary([allDuplicates], NOW).overall.errorRatePercent).toBe(0);

    const mixed = batch({
      id: 'b2',
      createdAt: '2026-07-06T11:58:00Z',
      totalCount: 4,
      acceptedCount: 2,
      quarantinedCount: 1,
      duplicateCount: 1,
    });
    expect(computeIngestHealthSummary([mixed], NOW).overall.errorRatePercent).toBe(25);
  });

  it('reports 0% error rate when total records is 0, not NaN/Infinity', () => {
    const batches = [batch({ id: 'b1', createdAt: '2026-07-06T11:58:00Z', totalCount: 0 })];
    const summary = computeIngestHealthSummary(batches, NOW);
    expect(summary.overall.errorRatePercent).toBe(0);
  });

  it('computes freshness in minutes since the most recent batch', () => {
    const batches = [batch({ id: 'b1', createdAt: '2026-07-06T11:45:00Z', totalCount: 1, acceptedCount: 1 })];
    const summary = computeIngestHealthSummary(batches, NOW);
    expect(summary.overall.freshnessMinutes).toBe(15);
    expect(summary.overall.latestBatchAt).toBe('2026-07-06T11:45:00.000Z');
  });

  it('uses the latest of several batches for freshness, not the first in the array', () => {
    const batches = [
      batch({ id: 'older', createdAt: '2026-07-06T10:00:00Z', totalCount: 1, acceptedCount: 1 }),
      batch({ id: 'newer', createdAt: '2026-07-06T11:55:00Z', totalCount: 1, acceptedCount: 1 }),
    ];
    const summary = computeIngestHealthSummary(batches, NOW);
    expect(summary.overall.freshnessMinutes).toBe(5);
  });

  it('floors the throughput window so a burst of same-minute batches does not report an inflated rate', () => {
    const batches = [
      batch({ id: 'b1', createdAt: '2026-07-06T11:59:59Z', totalCount: 1000, acceptedCount: 1000 }),
    ];
    const summary = computeIngestHealthSummary(batches, NOW);
    // Window floored to 1 minute even though the batch is ~1 second old.
    expect(summary.overall.throughputPerMinute).toBeLessThanOrEqual(1000);
    expect(summary.overall.throughputPerMinute).toBeGreaterThan(0);
  });

  it('groups rollups by kind, in entity/event/measure order, omitting kinds with no batches', () => {
    const batches = [
      batch({ id: 'b1', createdAt: '2026-07-06T11:00:00Z', kind: 'measure', totalCount: 1, acceptedCount: 1 }),
      batch({ id: 'b2', createdAt: '2026-07-06T11:01:00Z', kind: 'event', totalCount: 1, acceptedCount: 1 }),
    ];
    const summary = computeIngestHealthSummary(batches, NOW);
    expect(summary.byKind.map((k) => k.kind)).toEqual(['event', 'measure']);
  });

  it('flattens quarantined records across batches, tagging each with its batch id, record index, and kind', () => {
    const batches = [
      batch({
        id: 'b1',
        createdAt: '2026-07-06T11:00:00Z',
        kind: 'event',
        totalCount: 2,
        quarantinedCount: 2,
        recordResults: [
          { client_id: 'e1', status: 'quarantined', reasons: ['missing_required_field:plan'] },
          { client_id: 'e2', status: 'accepted' },
          { client_id: 'e3', status: 'quarantined', reasons: ['unregistered_field:foo'] },
        ],
      }),
    ];
    const summary = computeIngestHealthSummary(batches, NOW);
    expect(summary.quarantinedRecords).toEqual([
      { batchId: 'b1', recordIndex: 0, kind: 'event', environmentId: 'env-prod', clientId: 'e1', reasons: ['missing_required_field:plan'], createdAt: '2026-07-06T11:00:00Z' },
      { batchId: 'b1', recordIndex: 2, kind: 'event', environmentId: 'env-prod', clientId: 'e3', reasons: ['unregistered_field:foo'], createdAt: '2026-07-06T11:00:00Z' },
    ]);
  });

  it('gives two quarantined records that share a client id (before any dedup check runs) distinct record indexes', () => {
    // A batch can legitimately quarantine two records with the same
    // client-supplied id — e.g. two "signup" events with event_id "e1" both
    // missing the same required field. Both must survive with distinct
    // identities so a React list key built from (batchId, recordIndex)
    // never collides and silently drops one.
    const batches = [
      batch({
        id: 'b1',
        createdAt: '2026-07-06T11:00:00Z',
        totalCount: 2,
        quarantinedCount: 2,
        recordResults: [
          { client_id: 'e1', status: 'quarantined', reasons: ['missing_field:ts'] },
          { client_id: 'e1', status: 'quarantined', reasons: ['missing_field:ts'] },
        ],
      }),
    ];
    const summary = computeIngestHealthSummary(batches, NOW);
    expect(summary.quarantinedRecords).toHaveLength(2);
    expect(summary.quarantinedRecords.map((r) => r.recordIndex)).toEqual([0, 1]);
    const keys = summary.quarantinedRecords.map((r) => `${r.batchId}:${r.recordIndex}`);
    expect(new Set(keys).size).toBe(2);
  });

  it('truncates the quarantine browser at the given limit and flags the truncation', () => {
    const quarantined = Array.from({ length: 5 }, (_, i) => ({ client_id: `e${i}`, status: 'quarantined' as const, reasons: [] }));
    const batches = [batch({ id: 'b1', createdAt: '2026-07-06T11:00:00Z', totalCount: 5, quarantinedCount: 5, recordResults: quarantined })];

    const summary = computeIngestHealthSummary(batches, NOW, 3);
    expect(summary.quarantinedRecords).toHaveLength(3);
    expect(summary.quarantinedRecordsTruncated).toBe(true);
  });

  it('does not flag truncation when quarantined records fit exactly within the limit', () => {
    const batches = [
      batch({
        id: 'b1',
        createdAt: '2026-07-06T11:00:00Z',
        totalCount: 1,
        quarantinedCount: 1,
        recordResults: [{ client_id: 'e1', status: 'quarantined', reasons: [] }],
      }),
    ];
    const summary = computeIngestHealthSummary(batches, NOW, 1);
    expect(summary.quarantinedRecordsTruncated).toBe(false);
  });

  it('defaults the quarantine browser limit to DEFAULT_QUARANTINE_BROWSER_LIMIT', () => {
    expect(DEFAULT_QUARANTINE_BROWSER_LIMIT).toBeGreaterThan(0);
  });
});

describe('formatMinutesAgo', () => {
  it('shows "<1" for sub-minute freshness', () => {
    expect(formatMinutesAgo(0.4)).toBe('<1');
  });

  it('rounds whole minutes', () => {
    expect(formatMinutesAgo(4.6)).toBe('5');
    expect(formatMinutesAgo(1)).toBe('1');
  });
});

describe('formatThroughput', () => {
  it('shows one decimal place below 10/min', () => {
    expect(formatThroughput(3.14159)).toBe('3.1');
  });

  it('shows a rounded whole number at or above 10/min', () => {
    expect(formatThroughput(12.4)).toBe('12');
  });

  it('takes the whole-number branch for a value that rounds up to exactly 10, not "10.0"', () => {
    expect(formatThroughput(9.96)).toBe('10');
  });
});
