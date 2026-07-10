import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { parseCreateBoardRequestBody, parseSaveBoardTilesRequestBody, parseUpdateBoardSettingsRequestBody } from './parse-board-fields';

function request(body?: unknown): NextRequest {
  return new NextRequest('https://growthos.test/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const validTile = {
  id: 'tile-1',
  type: 'big_number',
  title: 'Ad spend',
  layout: { x: 0, y: 0, w: 3, h: 2 },
  metricNames: ['ad_spend'],
  dimensions: [],
};

describe('parseCreateBoardRequestBody', () => {
  it('accepts a non-empty name', async () => {
    const parsed = await parseCreateBoardRequestBody(request({ name: 'Marketing' }));
    expect(parsed).toEqual({ name: 'Marketing' });
  });

  it('rejects a missing or whitespace-only name', async () => {
    expect((await parseCreateBoardRequestBody(request({}))).error?.status).toBe(400);
    expect((await parseCreateBoardRequestBody(request({ name: '   ' }))).error?.status).toBe(400);
  });

  it('rejects invalid JSON', async () => {
    const badRequest = new NextRequest('https://growthos.test/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    expect((await parseCreateBoardRequestBody(badRequest)).error?.status).toBe(400);
  });
});

describe('parseUpdateBoardSettingsRequestBody', () => {
  it('returns an empty object when no fields are sent — a partial update with nothing to change', async () => {
    const parsed = await parseUpdateBoardSettingsRequestBody(request({}));
    expect(parsed).toEqual({});
  });

  it('parses every field when all are sent', async () => {
    const parsed = await parseUpdateBoardSettingsRequestBody(
      request({
        name: 'Revenue',
        dateRange: { start: '2026-01-01', end: '2026-01-31', grain: 'week' },
        compare: 'previous_year',
        globalFilters: [{ field: 'channel', operator: '=', value: 'google' }],
      }),
    );
    expect(parsed).toEqual({
      name: 'Revenue',
      dateRange: { start: '2026-01-01', end: '2026-01-31', grain: 'week' },
      compare: 'previous_year',
      globalFilters: [{ field: 'channel', operator: '=', value: 'google' }],
    });
  });

  it('rejects an empty name', async () => {
    expect((await parseUpdateBoardSettingsRequestBody(request({ name: '  ' }))).error?.status).toBe(400);
  });

  it('rejects a malformed date range object (missing/wrong-typed fields, or an unknown grain)', async () => {
    expect((await parseUpdateBoardSettingsRequestBody(request({ dateRange: { start: '2026-01-01' } }))).error?.status).toBe(400);
    expect((await parseUpdateBoardSettingsRequestBody(request({ dateRange: 'not-an-object' }))).error?.status).toBe(400);
    expect(
      (await parseUpdateBoardSettingsRequestBody(request({ dateRange: { start: '2026-01-01', end: '2026-01-31', grain: 'decade' } }))).error?.status,
    ).toBe(400);
  });

  it('accepts an explicit null compare (clears it) and rejects an unknown compare value', async () => {
    const cleared = await parseUpdateBoardSettingsRequestBody(request({ compare: null }));
    expect(cleared).toEqual({ compare: null });
    expect((await parseUpdateBoardSettingsRequestBody(request({ compare: 'yesterday' }))).error?.status).toBe(400);
  });

  it('rejects a global filter with a missing field, wrong-typed value, or an operator outside the known set', async () => {
    expect((await parseUpdateBoardSettingsRequestBody(request({ globalFilters: 'not-an-array' }))).error?.status).toBe(400);
    expect((await parseUpdateBoardSettingsRequestBody(request({ globalFilters: [{ operator: '=', value: 'google' }] }))).error?.status).toBe(400);
    expect(
      (await parseUpdateBoardSettingsRequestBody(request({ globalFilters: [{ field: 'channel', operator: '=', value: 5 }] }))).error?.status,
    ).toBe(400);
    expect(
      (await parseUpdateBoardSettingsRequestBody(request({ globalFilters: [{ field: 'channel', operator: 'contains', value: 'g' }] }))).error
        ?.status,
    ).toBe(400);
  });
});

describe('parseSaveBoardTilesRequestBody', () => {
  it('accepts a well-formed tiles array', async () => {
    const parsed = await parseSaveBoardTilesRequestBody(request({ tiles: [validTile] }));
    expect(parsed).toEqual({ tiles: [validTile] });
  });

  it('accepts an empty tiles array', async () => {
    expect(await parseSaveBoardTilesRequestBody(request({ tiles: [] }))).toEqual({ tiles: [] });
  });

  it('rejects a missing or non-array tiles field', async () => {
    expect((await parseSaveBoardTilesRequestBody(request({}))).error?.status).toBe(400);
    expect((await parseSaveBoardTilesRequestBody(request({ tiles: 'nope' }))).error?.status).toBe(400);
  });

  it('rejects a tile missing an id, an unknown type, a malformed layout, or non-string metricNames/dimensions', async () => {
    expect((await parseSaveBoardTilesRequestBody(request({ tiles: [{ ...validTile, id: '' }] }))).error?.status).toBe(400);
    expect((await parseSaveBoardTilesRequestBody(request({ tiles: [{ ...validTile, type: 'pie' }] }))).error?.status).toBe(400);
    expect((await parseSaveBoardTilesRequestBody(request({ tiles: [{ ...validTile, layout: { x: 0, y: 0, w: 3 } }] }))).error?.status).toBe(400);
    expect((await parseSaveBoardTilesRequestBody(request({ tiles: [{ ...validTile, metricNames: [1] }] }))).error?.status).toBe(400);
    expect((await parseSaveBoardTilesRequestBody(request({ tiles: [{ ...validTile, dimensions: [1] }] }))).error?.status).toBe(400);
  });

  it('accepts a heatmap tile carrying cohortConversionEvent, and rejects a non-string value (KAN-62)', async () => {
    const heatmapTile = { ...validTile, type: 'heatmap', metricNames: [], cohortConversionEvent: 'activated' };
    const parsed = await parseSaveBoardTilesRequestBody(request({ tiles: [heatmapTile] }));
    expect(parsed).toEqual({ tiles: [heatmapTile] });

    expect((await parseSaveBoardTilesRequestBody(request({ tiles: [{ ...heatmapTile, cohortConversionEvent: 5 }] }))).error?.status).toBe(400);
  });

  it('omits cohortConversionEvent entirely for a tile that never sent it, rather than defaulting it to an empty string', async () => {
    const parsed = await parseSaveBoardTilesRequestBody(request({ tiles: [validTile] }));
    expect(parsed.tiles?.[0]).not.toHaveProperty('cohortConversionEvent');
  });
});
