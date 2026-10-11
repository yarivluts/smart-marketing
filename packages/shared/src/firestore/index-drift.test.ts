import { describe, expect, it } from 'vitest';
import { compareIndexes, formatIndexDrift, hasIndexDrift, indexKey, type CompositeIndex } from './index-drift';

const RAW_RECORDS_4: CompositeIndex = {
  collectionGroup: 'raw_records',
  fields: [
    { fieldPath: 'environment_id', order: 'ASCENDING' },
    { fieldPath: 'kind', order: 'ASCENDING' },
    { fieldPath: 'schema_name', order: 'ASCENDING' },
    { fieldPath: 'landed_at', order: 'DESCENDING' },
  ],
};

/** The same index as Firestore stores it: with the implicit `__name__` tiebreaker appended. */
const RAW_RECORDS_4_AS_DEPLOYED: CompositeIndex = {
  collectionGroup: 'raw_records',
  fields: [...RAW_RECORDS_4.fields, { fieldPath: '__name__', order: 'DESCENDING' }],
};

/** The stale predecessor, from before the query gained its environment split. */
const RAW_RECORDS_3: CompositeIndex = {
  collectionGroup: 'raw_records',
  fields: [
    { fieldPath: 'kind', order: 'ASCENDING' },
    { fieldPath: 'schema_name', order: 'ASCENDING' },
    { fieldPath: 'landed_at', order: 'DESCENDING' },
  ],
};

describe('indexKey', () => {
  it('ignores the __name__ field Firestore appends, so the two sides compare', () => {
    // Without this the declared and deployed forms of one index never match and
    // everything reads as drift.
    expect(indexKey(RAW_RECORDS_4)).toBe(indexKey(RAW_RECORDS_4_AS_DEPLOYED));
  });

  it('treats field order as significant', () => {
    // (a, b) and (b, a) serve different queries; collapsing them would report a
    // missing index as present.
    const reversed: CompositeIndex = { collectionGroup: 'raw_records', fields: [...RAW_RECORDS_3.fields].reverse() };
    expect(indexKey(reversed)).not.toBe(indexKey(RAW_RECORDS_3));
  });

  it('treats direction as significant', () => {
    const ascending: CompositeIndex = {
      collectionGroup: 'raw_records',
      fields: [
        { fieldPath: 'kind', order: 'ASCENDING' },
        { fieldPath: 'schema_name', order: 'ASCENDING' },
        { fieldPath: 'landed_at', order: 'ASCENDING' },
      ],
    };
    expect(indexKey(ascending)).not.toBe(indexKey(RAW_RECORDS_3));
  });

  it('is case-insensitive about the order keyword', () => {
    const lower: CompositeIndex = { collectionGroup: 'raw_records', fields: [{ fieldPath: 'kind', order: 'ascending' }] };
    const upper: CompositeIndex = { collectionGroup: 'raw_records', fields: [{ fieldPath: 'kind', order: 'ASCENDING' }] };
    expect(indexKey(lower)).toBe(indexKey(upper));
  });

  it('distinguishes the same field list on different collections', () => {
    expect(indexKey({ ...RAW_RECORDS_3, collectionGroup: 'events' })).not.toBe(indexKey(RAW_RECORDS_3));
  });

  it('handles an array-contains field, which carries arrayConfig instead of order', () => {
    const arrayIndex: CompositeIndex = {
      collectionGroup: 'segments',
      fields: [{ fieldPath: 'tags', arrayConfig: 'CONTAINS' }, { fieldPath: 'created_at', order: 'DESCENDING' }],
    };
    expect(indexKey(arrayIndex)).toContain('tags:CONTAINS');
  });
});

describe('compareIndexes', () => {
  it('reports nothing when both sides agree', () => {
    const drift = compareIndexes([RAW_RECORDS_4], [RAW_RECORDS_4_AS_DEPLOYED]);
    expect(hasIndexDrift(drift)).toBe(false);
  });

  it('catches the real KAN-129 case: declared, never deployed', () => {
    // Exactly what happened: the 4-field index was declared when the query
    // gained environment_id, production still had only the 3-field predecessor,
    // and every test passed because the emulator does not enforce indexes.
    const drift = compareIndexes([RAW_RECORDS_4], [RAW_RECORDS_3]);
    expect(drift.declaredNotDeployed.map(indexKey)).toEqual([indexKey(RAW_RECORDS_4)]);
    expect(drift.deployedNotDeclared.map(indexKey)).toEqual([indexKey(RAW_RECORDS_3)]);
    expect(hasIndexDrift(drift)).toBe(true);
  });

  it('catches the opposite direction, which is a latent deletion rather than a crash', () => {
    const drift = compareIndexes([], [RAW_RECORDS_4_AS_DEPLOYED]);
    expect(drift.declaredNotDeployed).toEqual([]);
    expect(drift.deployedNotDeclared.map(indexKey)).toEqual([indexKey(RAW_RECORDS_4)]);
  });

  it('handles both sides empty', () => {
    expect(hasIndexDrift(compareIndexes([], []))).toBe(false);
  });
});

describe('formatIndexDrift', () => {
  it('says plainly when there is nothing to report', () => {
    expect(formatIndexDrift(compareIndexes([RAW_RECORDS_4], [RAW_RECORDS_4_AS_DEPLOYED]))).toContain('No drift');
  });

  it('names the consequence of each direction, not just the count', () => {
    const report = formatIndexDrift(compareIndexes([RAW_RECORDS_4], [RAW_RECORDS_3]));
    // A reader who does not already know why drift matters has to learn it here.
    expect(report).toContain('FAILED_PRECONDITION');
    expect(report).toContain('can delete these');
    expect(report).toContain('raw_records[environment_id:ASCENDING,kind:ASCENDING,schema_name:ASCENDING,landed_at:DESCENDING]');
  });
});
