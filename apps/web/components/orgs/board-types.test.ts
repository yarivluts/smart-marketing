import { describe, expect, it } from 'vitest';
import { defaultTileSize, nextTileRow, type BoardTileRow } from './board-types';

function tile(y: number, h: number): BoardTileRow {
  return {
    id: `t-${y}-${h}`,
    type: 'big_number',
    title: 'Tile',
    layout: { x: 0, y, w: 3, h },
    metricNames: ['ad_spend'],
    dimensions: [],
  };
}

describe('defaultTileSize', () => {
  it('gives a big_number tile a small default size', () => {
    expect(defaultTileSize('big_number')).toEqual({ w: 3, h: 2 });
  });

  it('gives every other tile type a larger default size', () => {
    expect(defaultTileSize('line')).toEqual({ w: 6, h: 4 });
    expect(defaultTileSize('bar')).toEqual({ w: 6, h: 4 });
    expect(defaultTileSize('table')).toEqual({ w: 6, h: 4 });
    expect(defaultTileSize('funnel')).toEqual({ w: 6, h: 4 });
  });

  it('gives a heatmap tile a little extra height for its cohort-month rows (KAN-62)', () => {
    expect(defaultTileSize('heatmap')).toEqual({ w: 6, h: 5 });
  });
});

describe('nextTileRow', () => {
  it('returns 0 for an empty board', () => {
    expect(nextTileRow([])).toBe(0);
  });

  it('returns the bottom edge of the lowest tile', () => {
    expect(nextTileRow([tile(0, 2), tile(2, 4)])).toBe(6);
  });

  it('is not fooled by insertion order — takes the max bottom edge, not the last tile', () => {
    expect(nextTileRow([tile(4, 2), tile(0, 8)])).toBe(8);
  });
});
