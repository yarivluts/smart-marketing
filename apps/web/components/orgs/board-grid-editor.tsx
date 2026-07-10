'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TileRenderView } from '@/lib/orgs/board-view';
import { BOARD_GRID_COLUMNS, BOARD_TILE_TYPES, defaultTileSize, nextTileRow, type BoardTileRow, type BoardTileTypeRow, type MetricCatalogEntryRow } from './board-types';
import { BoardTileView } from './board-tile-view';

export interface BoardGridEditorProps {
  orgId: string;
  projectId: string;
  boardId: string;
  initialTiles: BoardTileRow[];
  metricCatalog: MetricCatalogEntryRow[];
  renderViews: Record<string, TileRenderView>;
}

function newTileId(): string {
  return `tile-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function blankTile(metricCatalog: MetricCatalogEntryRow[], existingTiles: BoardTileRow[]): BoardTileRow {
  const type: BoardTileTypeRow = 'big_number';
  const firstMetric = metricCatalog[0]?.name;
  return {
    id: newTileId(),
    type,
    title: '',
    layout: { x: 0, y: nextTileRow(existingTiles), ...defaultTileSize(type) },
    metricNames: firstMetric ? [firstMetric] : [],
    dimensions: [],
  };
}

interface TileEditCardProps {
  tile: BoardTileRow;
  metricCatalog: MetricCatalogEntryRow[];
  draggable: boolean;
  onChange: (next: BoardTileRow) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}

function TileEditCard({ tile, metricCatalog, draggable, onChange, onRemove, onDragStart, onDrop }: TileEditCardProps): React.ReactElement {
  const t = useTranslations('Boards');
  const dimensionOptions = tile.type === 'funnel' ? [] : (metricCatalog.find((entry) => entry.name === tile.metricNames[0])?.dimensions ?? []);

  function setType(type: BoardTileTypeRow): void {
    const size = defaultTileSize(type);
    const isFunnel = type === 'funnel';
    const isHeatmap = type === 'heatmap';
    const metricName = tile.metricNames[0] ?? metricCatalog[0]?.name ?? '';
    // A heatmap tile's matrix has no column axis without exactly one
    // dimension (`validateTiles`'s own server-side rule) — default to the
    // tile's current dimension if it's still valid for this metric,
    // otherwise the metric's first declared dimension, rather than
    // carrying over a zero- or multi-dimension selection from whatever
    // type this tile was before.
    const heatmapDimensionOptions = metricCatalog.find((entry) => entry.name === metricName)?.dimensions ?? [];
    const heatmapDimension = tile.dimensions.find((dimension) => heatmapDimensionOptions.includes(dimension)) ?? heatmapDimensionOptions[0];
    onChange({
      ...tile,
      type,
      layout: { ...tile.layout, w: size.w, h: size.h },
      metricNames: isFunnel ? (tile.metricNames.length >= 2 ? tile.metricNames : [metricName, metricCatalog[1]?.name ?? metricName]) : [metricName],
      dimensions: isFunnel ? [] : isHeatmap ? (heatmapDimension ? [heatmapDimension] : []) : tile.dimensions,
    });
  }

  function setSingleMetric(name: string): void {
    // A heatmap tile always needs exactly one dimension — default to the
    // newly-selected metric's first declared dimension rather than leaving
    // the tile momentarily invalid (see `setType`'s own doc comment).
    const firstDimension = tile.type === 'heatmap' ? (metricCatalog.find((entry) => entry.name === name)?.dimensions[0] ?? undefined) : undefined;
    onChange({ ...tile, metricNames: [name], dimensions: firstDimension ? [firstDimension] : [] });
  }

  function setHeatmapDimension(dimension: string): void {
    onChange({ ...tile, dimensions: [dimension] });
  }

  function setFunnelStep(index: number, name: string): void {
    onChange({ ...tile, metricNames: tile.metricNames.map((existing, i) => (i === index ? name : existing)) });
  }

  function addFunnelStep(): void {
    onChange({ ...tile, metricNames: [...tile.metricNames, metricCatalog[0]?.name ?? ''] });
  }

  function removeFunnelStep(index: number): void {
    onChange({ ...tile, metricNames: tile.metricNames.filter((_, i) => i !== index) });
  }

  function toggleDimension(dimension: string): void {
    const has = tile.dimensions.includes(dimension);
    onChange({ ...tile, dimensions: has ? tile.dimensions.filter((d) => d !== dimension) : [...tile.dimensions, dimension] });
  }

  return (
    <div
      className="flex h-full flex-col gap-2 overflow-auto rounded-md border border-input bg-card p-3"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      data-testid={`tile-edit-card-${tile.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="cursor-move text-xs text-muted-foreground" aria-hidden="true">
          {t('dragHandleLabel')}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          {t('removeTileButton')}
        </Button>
      </div>

      <Input
        aria-label={t('tileTitleLabel')}
        placeholder={t('tileTitlePlaceholder')}
        value={tile.title}
        onChange={(event) => onChange({ ...tile, title: event.target.value })}
      />

      <select
        aria-label={t('tileTypeLabel')}
        value={tile.type}
        onChange={(event) => setType(event.target.value as BoardTileTypeRow)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        {BOARD_TILE_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(`tileType.${type}`)}
          </option>
        ))}
      </select>

      {tile.type === 'funnel' ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t('funnelStepsLabel')}</span>
          {tile.metricNames.map((name, index) => (
            <div key={index} className="flex items-center gap-1">
              <select
                aria-label={t('funnelStepLabel', { step: index + 1 })}
                value={name}
                onChange={(event) => setFunnelStep(index, event.target.value)}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              >
                {metricCatalog.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
              </select>
              {tile.metricNames.length > 2 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeFunnelStep(index)}>
                  {t('removeFunnelStepButton')}
                </Button>
              ) : null}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={addFunnelStep}>
            {t('addFunnelStepButton')}
          </Button>
        </div>
      ) : (
        <>
          <select
            aria-label={t('tileMetricLabel')}
            value={tile.metricNames[0] ?? ''}
            onChange={(event) => setSingleMetric(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {metricCatalog.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
          {tile.type === 'heatmap' && dimensionOptions.length > 0 ? (
            // A heatmap's matrix column axis needs exactly one dimension
            // (`validateTiles`'s own server-side rule) — a single select,
            // not the free-form multi-checkbox list every other
            // breakdown-capable type below uses, so the grid editor can't
            // even construct the invalid zero-or-many-dimension state.
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{t('tileDimensionsLabel')}</span>
              <select
                aria-label={t('tileDimensionsLabel')}
                value={tile.dimensions[0] ?? ''}
                onChange={(event) => setHeatmapDimension(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {dimensionOptions.map((dimension) => (
                  <option key={dimension} value={dimension}>
                    {dimension}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {tile.type !== 'big_number' && tile.type !== 'heatmap' && dimensionOptions.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{t('tileDimensionsLabel')}</span>
              {dimensionOptions.map((dimension) => (
                <label key={dimension} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={tile.dimensions.includes(dimension)} onChange={() => toggleDimension(dimension)} />
                  {dimension}
                </label>
              ))}
            </div>
          ) : null}
        </>
      )}

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {t('tileWidthLabel')}
          <Input
            type="number"
            min={1}
            max={BOARD_GRID_COLUMNS}
            className="h-8 w-16"
            value={tile.layout.w}
            onChange={(event) => onChange({ ...tile, layout: { ...tile.layout, w: Math.max(1, Math.min(BOARD_GRID_COLUMNS, Number(event.target.value) || 1)) } })}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {t('tileHeightLabel')}
          <Input
            type="number"
            min={1}
            max={12}
            className="h-8 w-16"
            value={tile.layout.h}
            onChange={(event) => onChange({ ...tile, layout: { ...tile.layout, h: Math.max(1, Number(event.target.value) || 1) } })}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * The board's grid — a plain 12-column CSS grid (`BOARD_GRID_COLUMNS`), each
 * tile positioned via `grid-column`/`grid-row` from its own `layout`. View
 * mode renders every tile's already-queried data (`renderViews`, computed
 * server-side by the board page); edit mode swaps to editable cards with a
 * native HTML5 drag-and-drop position swap, add/remove, and w/h resize
 * inputs — the KAN-60 AC's "build a board with 6 tiles without code; layout
 * persists" surface. Every edit is staged in local state; nothing reaches
 * Firestore until "Save layout" replaces the board's whole `tiles` array in
 * one write (see `saveBoardTiles`'s own doc comment for why).
 */
export function BoardGridEditor({ orgId, projectId, boardId, initialTiles, metricCatalog, renderViews }: BoardGridEditorProps): React.ReactElement {
  const t = useTranslations('Boards');
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [tiles, setTiles] = useState<BoardTileRow[]>(initialTiles);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateTile(id: string, next: BoardTileRow): void {
    setTiles((current) => current.map((tile) => (tile.id === id ? next : tile)));
  }

  function removeTile(id: string): void {
    setTiles((current) => current.filter((tile) => tile.id !== id));
  }

  function addTile(): void {
    setTiles((current) => [...current, blankTile(metricCatalog, current)]);
  }

  /**
   * Swaps only the two tiles' *positions* (`x`/`y`) — each tile keeps its
   * own `w`/`h`. An earlier version swapped the whole `layout` (position
   * *and* size), which meant dragging a small tile onto a larger one
   * silently resized both — surprising for a "reorder" gesture. Swapping
   * position only can leave tiles visually overlapping when the two
   * differ in size (this is a reorder-by-drag, not a full collision-aware
   * bin-packing layout engine); a user can always fix that with the w/h
   * inputs afterward, the same "buildable-today, not the fully general
   * mechanism" posture this codebase's other v1 stories already accept.
   */
  function swapPositions(targetId: string): void {
    if (!draggedId || draggedId === targetId) {
      return;
    }
    setTiles((current) => {
      const dragged = current.find((tile) => tile.id === draggedId);
      const target = current.find((tile) => tile.id === targetId);
      if (!dragged || !target) {
        return current;
      }
      const draggedPosition = { x: dragged.layout.x, y: dragged.layout.y };
      const targetPosition = { x: target.layout.x, y: target.layout.y };
      return current.map((tile) => {
        if (tile.id === draggedId) {
          return { ...tile, layout: { ...tile.layout, ...targetPosition } };
        }
        if (tile.id === targetId) {
          return { ...tile, layout: { ...tile.layout, ...draggedPosition } };
        }
        return tile;
      });
    });
    setDraggedId(null);
  }

  async function handleSave(): Promise<void> {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/boards/${boardId}/tiles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiles }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error === 'invalid_board' ? t('saveLayoutInvalidError') : t('saveLayoutError'));
        return;
      }
      setMode('view');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function handleCancel(): void {
    setTiles(initialTiles);
    setError(null);
    setMode('view');
  }

  // Always renders the local `tiles` state — it's seeded from `initialTiles`
  // on mount and reset from it on Cancel, so it already reflects server
  // truth outside an active edit. Reading `initialTiles` directly for the
  // view-mode branch instead would flash stale content for a moment after a
  // successful Save (`setMode('view')` runs before `router.refresh()`'s
  // server round trip actually swaps in the freshly-saved `initialTiles`
  // prop).
  const displayTiles = tiles;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('tilesHeading')}</h2>
        {mode === 'view' ? (
          <Button type="button" variant="outline" onClick={() => setMode('edit')}>
            {t('editLayoutButton')}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {metricCatalog.length === 0 ? <span className="text-xs text-muted-foreground">{t('noMetricsRegistered')}</span> : null}
            <Button type="button" variant="outline" onClick={addTile} disabled={metricCatalog.length === 0}>
              {t('addTileButton')}
            </Button>
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={saving}>
              {t('cancelEditButton')}
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {t('saveLayoutButton')}
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {displayTiles.length === 0 ? (
        <p className="text-muted-foreground">{t('noTiles')}</p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${BOARD_GRID_COLUMNS}, minmax(0, 1fr))`, gridAutoRows: '2.5rem' }}>
          {displayTiles.map((tile) =>
            mode === 'edit' ? (
              <div
                key={tile.id}
                style={{
                  gridColumn: `${tile.layout.x + 1} / span ${tile.layout.w}`,
                  gridRow: `${tile.layout.y + 1} / span ${tile.layout.h}`,
                }}
              >
                <TileEditCard
                  tile={tile}
                  metricCatalog={metricCatalog}
                  draggable
                  onChange={(next) => updateTile(tile.id, next)}
                  onRemove={() => removeTile(tile.id)}
                  onDragStart={() => setDraggedId(tile.id)}
                  onDrop={() => swapPositions(tile.id)}
                />
              </div>
            ) : (
              <div
                key={tile.id}
                className="flex flex-col gap-1 rounded-md border border-input bg-card p-3"
                style={{
                  gridColumn: `${tile.layout.x + 1} / span ${tile.layout.w}`,
                  gridRow: `${tile.layout.y + 1} / span ${tile.layout.h}`,
                }}
              >
                <span className="text-sm font-medium">{tile.title || t(`tileType.${tile.type}`)}</span>
                <div className="flex-1">
                  <BoardTileView tile={tile} view={renderViews[tile.id] ?? { kind: 'unavailable', reason: 'query_error', message: tile.id }} />
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
