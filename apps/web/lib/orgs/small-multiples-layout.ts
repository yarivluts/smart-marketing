/**
 * Vertical sizing for a board bar tile (B25, following KAN-217). A bar tile split by a dimension
 * draws one small plot per value, stacked, inside a grid cell of fixed height. KAN-217 capped the
 * stack at three plots of a fixed height and let the tile body scroll - but three fixed-height plots
 * do not fit a default four-row tile, so the second plot was cut off at the bottom and the "+N more"
 * line that names the rest sat below the fold, where nobody scrolls to find it.
 *
 * So the stack is planned from the height the tile actually has: every part of it has a known pixel
 * height (the constants below mirror the Tailwind classes `BarChartView` renders with), and
 * {@link planBarChartLayout} picks the largest number of plots - never more than the cap - whose
 * fixed parts, a plot area of at least {@link MIN_PLOT_PX} each, and the "+N more" line all fit.
 * Whatever height is left is shared out as plot area. Pure, so it is testable without a layout
 * engine (jsdom has none).
 */

/** One board grid row - `gridAutoRows: '2.5rem'` in `board-grid-editor.tsx`. */
export const BOARD_GRID_ROW_PX = 40;
/** The gap between grid rows - the grid's `gap-3`. */
export const BOARD_GRID_GAP_PX = 12;
/** A tile cell's own chrome around its body: `p-3` top and bottom, the title line (`text-sm`), and the `gap-1` under it. */
export const TILE_CHROME_PX = 12 + 12 + 20 + 4;

/** Headroom above the plot for the value printed over the tallest bar (`pt-3`: a 10px label plus its margin). */
export const VALUE_HEADROOM_PX = 12;
/** The date axis under a plot (`h-3.5`). */
export const AXIS_ROW_PX = 14;
/** A small multiple's series label line (`text-[10px] leading-3`) plus the `gap-0.5` under it. */
export const SERIES_LABEL_ROW_PX = 12 + 2;
/** The gap between stacked plots, and above the "+N more" line (`gap-2`). */
export const STACK_GAP_PX = 8;
/** The "+N more" line (`text-xs`, one 16px line). */
export const MORE_LINE_PX = 16;
/** The smallest bar area still worth drawing; below it, fewer plots are shown instead. */
export const MIN_PLOT_PX = 20;
/** The tallest bar area: an unsplit tile's (the previous fixed `h-24` less its headroom) ... */
export const MAX_SINGLE_PLOT_PX = 80;
/** ... and each small multiple's, so a tall tile does not stretch a few plots into towers. */
export const MAX_MULTIPLE_PLOT_PX = 48;

/** The height a tile's body has on the board grid, from the rows its layout spans. */
export function tileBodyHeightPx(layoutRows: number): number {
  const rows = Math.max(1, Math.floor(layoutRows));
  return rows * BOARD_GRID_ROW_PX + (rows - 1) * BOARD_GRID_GAP_PX - TILE_CHROME_PX;
}

export interface BarChartLayoutInput {
  /** How many series the tile draws (1 for an unsplit tile). */
  seriesCount: number;
  /** The body height available, in px. */
  availableHeightPx: number;
  /** The most plots ever drawn (`MAX_SMALL_MULTIPLES`). */
  maxShown: number;
  /** Whether each plot carries a label line: its series name when split, or the previous-period legend. */
  labelled: boolean;
  /** Whether the stacked plots share one date axis under the last plot (their buckets are identical), rather than one axis each. */
  sharedAxis: boolean;
}

export interface BarChartLayout {
  /** How many plots to draw; the rest are listed behind "+N more". */
  shownCount: number;
  /** Each drawn plot's bar area, in px (the value headroom and axis come on top). */
  plotHeightPx: number;
  /** Each part, top to bottom, as rendered - their heights sum to the chart's total height. */
  parts: LayoutPart[];
}

export interface LayoutPart {
  kind: 'gap' | 'label' | 'headroom' | 'plot' | 'axis' | 'more';
  px: number;
}

/** The chart's total planned height. */
export function layoutHeightPx(layout: Pick<BarChartLayout, 'parts'>): number {
  return layout.parts.reduce((total, part) => total + part.px, 0);
}

function partsFor(shown: number, hidden: number, plotHeightPx: number, input: BarChartLayoutInput): LayoutPart[] {
  const parts: LayoutPart[] = [];
  for (let index = 0; index < shown; index += 1) {
    if (index > 0) {
      parts.push({ kind: 'gap', px: STACK_GAP_PX });
    }
    if (input.labelled) {
      parts.push({ kind: 'label', px: SERIES_LABEL_ROW_PX });
    }
    parts.push({ kind: 'headroom', px: VALUE_HEADROOM_PX }, { kind: 'plot', px: plotHeightPx });
    if (!input.sharedAxis || index === shown - 1) {
      parts.push({ kind: 'axis', px: AXIS_ROW_PX });
    }
  }
  if (hidden > 0) {
    parts.push({ kind: 'gap', px: STACK_GAP_PX }, { kind: 'more', px: MORE_LINE_PX });
  }
  return parts;
}

/**
 * The plot count and plot height that fit `availableHeightPx`, with the "+N more" line (when any
 * series is left out) inside it too. Tries the most plots first and settles for fewer until each
 * gets at least {@link MIN_PLOT_PX}. A tile too short for even one plot at that size still draws one
 * - at the minimum, and the body scrolls - since an empty tile would say less than a clipped one.
 */
export function planBarChartLayout(input: BarChartLayoutInput): BarChartLayout {
  const seriesCount = Math.max(1, input.seriesCount);
  const maxPlot = seriesCount > 1 ? MAX_MULTIPLE_PLOT_PX : MAX_SINGLE_PLOT_PX;
  for (let shown = Math.min(seriesCount, Math.max(1, input.maxShown)); shown >= 1; shown -= 1) {
    const fixed = layoutHeightPx({ parts: partsFor(shown, seriesCount - shown, 0, input) });
    const plotHeightPx = Math.min(maxPlot, Math.floor((input.availableHeightPx - fixed) / shown));
    if (plotHeightPx >= MIN_PLOT_PX) {
      return { shownCount: shown, plotHeightPx, parts: partsFor(shown, seriesCount - shown, plotHeightPx, input) };
    }
  }
  return { shownCount: 1, plotHeightPx: MIN_PLOT_PX, parts: partsFor(1, seriesCount - 1, MIN_PLOT_PX, input) };
}
