import { describe, expect, it } from 'vitest';
import { searchOmniSearchItems } from './search';
import type { OmniSearchItem } from './types';

function item(overrides: Partial<OmniSearchItem> & Pick<OmniSearchItem, 'id' | 'label'>): OmniSearchItem {
  return { type: 'board', href: `/boards/${overrides.id}`, ...overrides };
}

describe('searchOmniSearchItems', () => {
  const items: OmniSearchItem[] = [
    item({ id: 'b1', type: 'board', label: 'Marketing Overview' }),
    item({ id: 'b2', type: 'board', label: 'Revenue' }),
    item({ id: 'm1', type: 'metric', label: 'CAC', description: 'Customer acquisition cost' }),
    item({ id: 'm2', type: 'metric', label: 'MRR' }),
    item({ id: 's1', type: 'segment', label: 'At-risk customers' }),
    item({ id: 'c1', type: 'campaign', label: 'Spring Promo', description: 'Google Ads campaign' }),
  ];

  it('returns nothing for an empty or whitespace-only query', () => {
    expect(searchOmniSearchItems(items, '')).toEqual([]);
    expect(searchOmniSearchItems(items, '   ')).toEqual([]);
  });

  it('ranks an exact label match first', () => {
    const results = searchOmniSearchItems(items, 'MRR');
    expect(results[0]?.id).toBe('m2');
  });

  it('ranks a prefix match above a mid-string substring match', () => {
    const results = searchOmniSearchItems(items, 'rev');
    expect(results.map((r) => r.id)).toEqual(['b2']);
  });

  it('matches case-insensitively', () => {
    const results = searchOmniSearchItems(items, 'mrr');
    expect(results[0]?.id).toBe('m2');
  });

  it('matches a substring anywhere in the label', () => {
    const results = searchOmniSearchItems(items, 'view');
    expect(results.map((r) => r.id)).toEqual(['b1']);
  });

  it('ranks an earlier substring match position above a later one', () => {
    const results = searchOmniSearchItems(
      [item({ id: 'early', label: 'Signup Funnel' }), item({ id: 'late', label: 'Marketing Signup' })],
      'signup',
    );
    expect(results.map((r) => r.id)).toEqual(['early', 'late']);
  });

  it('matches on description only when the label does not match, ranked below label matches', () => {
    const results = searchOmniSearchItems(items, 'acquisition');
    expect(results.map((r) => r.id)).toEqual(['m1']);
  });

  it('ranks every label match above every description-only match', () => {
    const results = searchOmniSearchItems(
      [item({ id: 'desc-match', label: 'Zzz', description: 'contains ads term' }), item({ id: 'label-match', label: 'ads campaign' })],
      'ads',
    );
    expect(results.map((r) => r.id)).toEqual(['label-match', 'desc-match']);
  });

  it('breaks ties alphabetically by label', () => {
    const results = searchOmniSearchItems(
      [item({ id: 'z', label: 'Zebra Board' }), item({ id: 'a', label: 'Alpha Board' })],
      'board',
    );
    expect(results.map((r) => r.id)).toEqual(['a', 'z']);
  });

  it('excludes items with no match at all', () => {
    const results = searchOmniSearchItems(items, 'nonexistent-term-xyz');
    expect(results).toEqual([]);
  });

  it('truncates to the limit', () => {
    const manyItems = Array.from({ length: 20 }, (_, i) => item({ id: `board-${i}`, label: `Board ${i}` }));
    const results = searchOmniSearchItems(manyItems, 'board', 5);
    expect(results).toHaveLength(5);
  });

  it('defaults to a limit of 8', () => {
    const manyItems = Array.from({ length: 20 }, (_, i) => item({ id: `board-${i}`, label: `Board ${i}` }));
    expect(searchOmniSearchItems(manyItems, 'board')).toHaveLength(8);
  });
});
