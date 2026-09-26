import { describe, expect, it } from 'vitest';
import { defaultTileSize } from '@/components/orgs/board-types';
import { MAX_SMALL_MULTIPLES } from './chart-labels';
import {
  layoutHeightPx,
  MAX_MULTIPLE_PLOT_PX,
  MAX_SINGLE_PLOT_PX,
  MIN_PLOT_PX,
  MORE_LINE_PX,
  planBarChartLayout,
  tileBodyHeightPx,
  type BarChartLayout,
} from './small-multiples-layout';

const kinds = (layout: BarChartLayout) => layout.parts.map((part) => part.kind);

/**
 * B25: a split bar tile's small multiples must fit the tile's cell, with the "+N more" line inside
 * it too. jsdom has no layout engine, so the fit is proven on the sizing plan: every part the chart
 * renders has a fixed pixel height, and the parts of the plan must add up to no more than the body.
 */
describe('planBarChartLayout (B25)', () => {
  const defaultBarRows = defaultTileSize('bar').h;
  const split = (seriesCount: number, availableHeightPx: number) =>
    planBarChartLayout({ seriesCount, availableHeightPx, maxShown: MAX_SMALL_MULTIPLES, labelled: true, sharedAxis: true });

  it('the reported case: 4 campaigns in a default-height (4-row) tile draw 2 plots, and the plots plus "+2 more" fit the cell without scrolling', () => {
    const body = tileBodyHeightPx(defaultBarRows);
    const layout = split(4, body);

    expect(defaultBarRows).toBe(4);
    expect(layout.shownCount).toBe(2);
    expect(layout.plotHeightPx).toBeGreaterThanOrEqual(MIN_PLOT_PX);
    // Everything drawn - both plots, their labels and axis, and the "+N more" line - is inside the body.
    expect(layoutHeightPx(layout)).toBeLessThanOrEqual(body);
    // The "+N more" line is the last part, so it ends inside the visible area.
    expect(layout.parts.at(-1)).toEqual({ kind: 'more', px: MORE_LINE_PX });
  });

  it('never plans a stack taller than the body, for any split and any tile height with room for one plot', () => {
    for (let rows = 3; rows <= 12; rows += 1) {
      for (let seriesCount = 1; seriesCount <= 8; seriesCount += 1) {
        const body = tileBodyHeightPx(rows);
        const layout = split(seriesCount, body);
        expect(layoutHeightPx(layout)).toBeLessThanOrEqual(body);
        expect(layout.shownCount).toBeLessThanOrEqual(Math.min(seriesCount, MAX_SMALL_MULTIPLES));
        expect(layout.plotHeightPx).toBeGreaterThanOrEqual(MIN_PLOT_PX);
      }
    }
  });

  it('draws the full cap of 3 once the tile is tall enough, with each plot no taller than a small multiple\'s maximum', () => {
    const layout = split(5, tileBodyHeightPx(8));
    expect(layout.shownCount).toBe(3);
    expect(layout.plotHeightPx).toBeLessThanOrEqual(MAX_MULTIPLE_PLOT_PX);
  });

  it('reserves no "+N more" line when every series is drawn', () => {
    const layout = split(2, tileBodyHeightPx(defaultBarRows));
    expect(layout.shownCount).toBe(2);
    expect(kinds(layout)).not.toContain('more');
  });

  it('gives each plot its own axis when the plots do not share buckets', () => {
    const shared = split(2, tileBodyHeightPx(6));
    const separate = planBarChartLayout({ seriesCount: 2, availableHeightPx: tileBodyHeightPx(6), maxShown: MAX_SMALL_MULTIPLES, labelled: true, sharedAxis: false });
    expect(kinds(shared).filter((kind) => kind === 'axis')).toHaveLength(1);
    expect(kinds(separate).filter((kind) => kind === 'axis')).toHaveLength(2);
    expect(layoutHeightPx(separate)).toBeLessThanOrEqual(tileBodyHeightPx(6));
  });

  it('keeps an unsplit bar tile at its previous plot size in a default tile', () => {
    const layout = planBarChartLayout({ seriesCount: 1, availableHeightPx: tileBodyHeightPx(defaultBarRows), maxShown: MAX_SMALL_MULTIPLES, labelled: false, sharedAxis: false });
    expect(layout.shownCount).toBe(1);
    expect(layout.plotHeightPx).toBe(MAX_SINGLE_PLOT_PX);
  });

  it('still draws one plot, at the minimum, in a tile too short for it (the body scrolls rather than going blank)', () => {
    const layout = split(4, tileBodyHeightPx(1));
    expect(layout.shownCount).toBe(1);
    expect(layout.plotHeightPx).toBe(MIN_PLOT_PX);
  });
});

describe('tileBodyHeightPx', () => {
  it('is the rows the tile spans, plus the gaps between them, less the cell padding and title', () => {
    // 4 x 40px rows + 3 x 12px gaps - (12 + 12 padding + 20 title + 4 gap)
    expect(tileBodyHeightPx(4)).toBe(148);
  });
});
