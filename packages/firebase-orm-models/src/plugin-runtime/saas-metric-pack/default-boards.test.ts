import { describe, expect, it } from 'vitest';
import { BOARD_GRID_COLUMNS } from '../../models/board.model';
import { SAAS_METRIC_PACK_DEFAULT_BOARDS } from './default-boards';
import { SAAS_METRIC_PACK_METRICS } from './metrics';

/**
 * Pure, Firestore-free tests for KAN-61's three default boards — checks the
 * same invariants `board.service.ts`'s `validateTiles` enforces at save
 * time (metric names resolve, dimensions are declared by their metric,
 * layouts fit the grid, tile ids are unique), so a bad board definition
 * fails fast here rather than only surfacing as a `saveBoardTiles` rejection
 * inside the slower emulator-backed install test.
 */

const metricsByName = new Map(SAAS_METRIC_PACK_METRICS.map((metric) => [metric.name, metric]));

describe('SAAS_METRIC_PACK_DEFAULT_BOARDS', () => {
  it('names exactly the three boards KAN-59/61\'s own AC lists: Marketing, Revenue/MRR, Funnel', () => {
    expect(SAAS_METRIC_PACK_DEFAULT_BOARDS.map((board) => board.name)).toEqual(['Marketing', 'Revenue / MRR', 'Funnel']);
  });

  it('has a unique, non-empty name per board', () => {
    const names = SAAS_METRIC_PACK_DEFAULT_BOARDS.map((board) => board.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  for (const board of SAAS_METRIC_PACK_DEFAULT_BOARDS) {
    describe(`"${board.name}" board`, () => {
      it('has at least one tile', () => {
        expect(board.tiles.length).toBeGreaterThan(0);
      });

      it('has unique, non-empty tile ids', () => {
        const ids = board.tiles.map((tile) => tile.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
          expect(id.trim().length).toBeGreaterThan(0);
        }
      });

      it('has a non-empty title per tile', () => {
        for (const tile of board.tiles) {
          expect(tile.title.trim().length).toBeGreaterThan(0);
        }
      });

      it('has a valid, in-bounds grid layout per tile', () => {
        for (const tile of board.tiles) {
          const { x, y, w, h } = tile.layout;
          expect(Number.isInteger(x)).toBe(true);
          expect(Number.isInteger(y)).toBe(true);
          expect(Number.isInteger(w)).toBe(true);
          expect(Number.isInteger(h)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(w).toBeGreaterThanOrEqual(1);
          expect(h).toBeGreaterThanOrEqual(1);
          expect(x + w).toBeLessThanOrEqual(BOARD_GRID_COLUMNS);
        }
      });

      it('respects each tile type\'s metric-count rule (funnel needs >=2, everything else exactly 1)', () => {
        for (const tile of board.tiles) {
          if (tile.type === 'funnel') {
            expect(tile.metricNames.length).toBeGreaterThanOrEqual(2);
          } else {
            expect(tile.metricNames).toHaveLength(1);
          }
        }
      });

      it('references only metric names this pack itself registers', () => {
        for (const tile of board.tiles) {
          for (const metricName of tile.metricNames) {
            expect(metricsByName.has(metricName), `tile "${tile.id}" references unregistered metric "${metricName}"`).toBe(true);
          }
        }
      });

      // Mirrors `validateTiles`'s own nested loop exactly (`board.service.ts`):
      // for every metric a tile references, every one of that tile's
      // dimensions must be declared by *that* metric — not just by any one
      // of the tile's metrics. Only `funnel` tiles (this pack's only
      // multi-metric tile type) could ever tell the difference, and every
      // funnel tile here has `dimensions: []`, but this asserts the real
      // per-metric rule rather than a looser "some metric declares it" one.
      it('requests only dimensions every one of its referenced metrics actually declares', () => {
        for (const tile of board.tiles) {
          for (const metricName of tile.metricNames) {
            const metric = metricsByName.get(metricName);
            for (const dimension of tile.dimensions) {
              expect(
                metric?.dimensions.includes(dimension),
                `tile "${tile.id}" requests dimension "${dimension}", which metric "${metricName}" doesn't declare`,
              ).toBe(true);
            }
          }
        }
      });
    });
  }

  it('the "Funnel" board\'s funnel tile steps from signups to new_paying, in that order', () => {
    const funnelBoard = SAAS_METRIC_PACK_DEFAULT_BOARDS.find((board) => board.name === 'Funnel');
    const funnelTile = funnelBoard?.tiles.find((tile) => tile.type === 'funnel');
    expect(funnelTile?.metricNames).toEqual(['signups', 'new_paying']);
  });
});
