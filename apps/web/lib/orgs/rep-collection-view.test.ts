import { describe, expect, it } from 'vitest';
import type { RepCollectionBillingSignal, RepCollectionEntryModel, RepCollectionLeaderboardResult } from '@growthos/firebase-orm-models';
import { repCollectionTypeLabelKey, toRepCollectionBillingSignalRow, toRepCollectionEntryRow, toRepCollectionLeaderboardView } from './rep-collection-view';

function entry(overrides: Partial<RepCollectionEntryModel> = {}): RepCollectionEntryModel {
  return {
    id: 'entry-1',
    org_person_id: 'person-1',
    company: 'Acme Inc',
    collection_type: 'upgrade',
    plan_from: 'Starter',
    plan_to: 'Pro',
    amount: 500,
    occurred_at: '2026-08-24',
    note: 'Upsell after QBR',
    ...overrides,
  } as RepCollectionEntryModel;
}

describe('toRepCollectionEntryRow', () => {
  it('maps every field, including plan_from/plan_to/note', () => {
    expect(toRepCollectionEntryRow(entry())).toEqual({
      id: 'entry-1',
      orgPersonId: 'person-1',
      company: 'Acme Inc',
      collectionType: 'upgrade',
      planFrom: 'Starter',
      planTo: 'Pro',
      amount: 500,
      occurredAt: '2026-08-24',
      note: 'Upsell after QBR',
    });
  });

  it('normalizes undefined optional fields to null, and a null org_person_id stays null (unattributed)', () => {
    const row = toRepCollectionEntryRow(
      entry({ org_person_id: null, plan_from: undefined, plan_to: undefined, note: undefined }),
    );
    expect(row.orgPersonId).toBeNull();
    expect(row.planFrom).toBeNull();
    expect(row.planTo).toBeNull();
    expect(row.note).toBeNull();
  });
});

describe('repCollectionTypeLabelKey', () => {
  it('namespaces the collection type under collectionType.', () => {
    expect(repCollectionTypeLabelKey('upgrade')).toBe('collectionType.upgrade');
    expect(repCollectionTypeLabelKey('save')).toBe('collectionType.save');
  });
});

describe('toRepCollectionLeaderboardView', () => {
  it('resolves each row against the people map, preserving order and pass-through totals', () => {
    const result: RepCollectionLeaderboardResult = {
      periodStart: '2026-08-24',
      periodEnd: '2026-08-30',
      rows: [
        { orgPersonId: 'person-1', totalAmount: 500, entryCount: 2 },
        { orgPersonId: 'person-2', totalAmount: 100, entryCount: 1 },
      ],
      unattributedTotal: 50,
      unattributedCount: 1,
    };
    const peopleById = new Map([
      ['person-1', 'Dana Rep'],
      ['person-2', 'Sam Rep'],
    ]);

    expect(toRepCollectionLeaderboardView(result, peopleById)).toEqual({
      periodStart: '2026-08-24',
      periodEnd: '2026-08-30',
      rows: [
        { orgPersonId: 'person-1', name: 'Dana Rep', totalAmount: 500, entryCount: 2 },
        { orgPersonId: 'person-2', name: 'Sam Rep', totalAmount: 100, entryCount: 1 },
      ],
      unattributedTotal: 50,
      unattributedCount: 1,
    });
  });

  it('falls back to the raw id when a rep is missing from the people map (e.g. since removed)', () => {
    const result: RepCollectionLeaderboardResult = {
      periodStart: '2026-08-24',
      periodEnd: '2026-08-30',
      rows: [{ orgPersonId: 'person-gone', totalAmount: 500, entryCount: 1 }],
      unattributedTotal: 0,
      unattributedCount: 0,
    };

    const view = toRepCollectionLeaderboardView(result, new Map());
    expect(view.rows[0]).toEqual({ orgPersonId: 'person-gone', name: 'person-gone', totalAmount: 500, entryCount: 1 });
  });
});

describe('toRepCollectionBillingSignalRow', () => {
  it('passes every field through unchanged', () => {
    const signal: RepCollectionBillingSignal = { rawRecordId: 'raw-1', amount: 42, currency: 'usd', customerId: 'cus_1', occurredAt: '2026-08-24T10:00:00.000Z' };
    expect(toRepCollectionBillingSignalRow(signal)).toEqual(signal);
  });
});
