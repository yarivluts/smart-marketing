import { describe, expect, it } from 'vitest';
import { BOARD_GRID_COLUMNS } from '../../models/board.model';
import { LANDING_PAGE_PACK_DEFAULT_BOARDS } from './default-boards';
import { LANDING_PAGE_PACK_METRICS } from './metrics';

/**
 * Pure, Firestore-free checks of the same invariants `board.service.ts`'s
 * `validateTiles` enforces at save time (metric names resolve, dimensions
 * are declared by their metric, layouts fit the grid, tile ids are unique) —
 * so a bad board definition fails here rather than only inside the slower
 * emulator-backed install test. Same shape as the SaaS pack's own
 * `default-boards.test.ts`.
 */

const metricsByName = new Map(LANDING_PAGE_PACK_METRICS.map((metric) => [metric.name, metric]));

describe('LANDING_PAGE_PACK_DEFAULT_BOARDS', () => {
  it('seeds exactly one board, the landing page performance board', () => {
    expect(LANDING_PAGE_PACK_DEFAULT_BOARDS.map((board) => board.name)).toEqual(['Landing page performance']);
  });

  for (const board of LANDING_PAGE_PACK_DEFAULT_BOARDS) {
    describe(`"${board.name}" board`, () => {
      it('has at least one tile, each with a unique id and a non-empty title', () => {
        expect(board.tiles.length).toBeGreaterThan(0);
        const ids = board.tiles.map((tile) => tile.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const tile of board.tiles) {
          expect(tile.id.trim().length).toBeGreaterThan(0);
          expect(tile.title.trim().length).toBeGreaterThan(0);
        }
      });

      it('only references metrics this pack registers', () => {
        for (const tile of board.tiles) {
          expect(tile.metricNames.length).toBeGreaterThan(0);
          for (const metricName of tile.metricNames) {
            expect(metricsByName.has(metricName)).toBe(true);
          }
        }
      });

      it('only breaks a tile down by a dimension its own metric declares', () => {
        for (const tile of board.tiles) {
          for (const dimension of tile.dimensions) {
            for (const metricName of tile.metricNames) {
              expect(metricsByName.get(metricName)?.dimensions).toContain(dimension);
            }
          }
        }
      });

      it('lays every tile out inside the grid, with positive size', () => {
        for (const tile of board.tiles) {
          expect(tile.layout.x).toBeGreaterThanOrEqual(0);
          expect(tile.layout.y).toBeGreaterThanOrEqual(0);
          expect(tile.layout.w).toBeGreaterThan(0);
          expect(tile.layout.h).toBeGreaterThan(0);
          expect(tile.layout.x + tile.layout.w).toBeLessThanOrEqual(BOARD_GRID_COLUMNS);
        }
      });

      it('gives big_number tiles no breakdown (a single total has nothing to break down by)', () => {
        for (const tile of board.tiles) {
          if (tile.type === 'big_number') {
            expect(tile.dimensions).toEqual([]);
          }
        }
      });

      it('carries the landing-page x campaign grid the pack exists for', () => {
        const gridTile = board.tiles.find(
          (tile) => tile.dimensions.includes('landing_page') && tile.dimensions.includes('campaign_id'),
        );
        expect(gridTile).toBeDefined();
        expect(gridTile?.type).toBe('table');
      });

      it('compares landing pages head to head on conversion rate', () => {
        const byPage = board.tiles.find(
          (tile) => tile.metricNames.includes('lp_conversion_rate') && tile.dimensions.includes('landing_page'),
        );
        expect(byPage).toBeDefined();
      });
    });
  }
});
