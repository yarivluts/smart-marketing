import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BoardGridEditor } from './board-grid-editor';
import type { BoardTileRow, MetricCatalogEntryRow } from './board-types';
import messages from '../../messages/en.json';
import type { TileRenderView } from '@/lib/orgs/board-view';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const adSpendTile: BoardTileRow = {
  id: 'tile-1',
  type: 'big_number',
  title: 'Ad spend',
  layout: { x: 0, y: 0, w: 3, h: 2 },
  metricNames: ['ad_spend'],
  dimensions: [],
};

const signupsTile: BoardTileRow = {
  id: 'tile-2',
  type: 'big_number',
  title: 'Signups',
  // Deliberately a different size from `adSpendTile` — the drag-swap test
  // below asserts positions swap while each tile keeps its own size.
  layout: { x: 6, y: 0, w: 6, h: 4 },
  metricNames: ['signups'],
  dimensions: [],
};

const metricCatalog: MetricCatalogEntryRow[] = [
  { name: 'ad_spend', dimensions: ['channel'] },
  { name: 'signups', dimensions: [] },
];

const renderViews: Record<string, TileRenderView> = {
  'tile-1': { kind: 'big_number', value: 100 },
  'tile-2': { kind: 'big_number', value: 40 },
};

function renderEditor(tiles: BoardTileRow[] = [adSpendTile, signupsTile], catalog: MetricCatalogEntryRow[] = metricCatalog): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoardGridEditor
        orgId="org-1"
        projectId="project-1"
        boardId="board-1"
        initialTiles={tiles}
        metricCatalog={catalog}
        renderViews={renderViews}
      />
    </NextIntlClientProvider>,
  );
}

describe('BoardGridEditor', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders every tile in view mode with its title and queried value', () => {
    renderEditor();
    expect(screen.getByText('Ad spend')).toBeInTheDocument();
    expect(screen.getByText('Signups')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('shows the empty state when there are no tiles', () => {
    renderEditor([]);
    expect(screen.getByText('This board has no tiles yet. Click "Edit layout" to add one.')).toBeInTheDocument();
  });

  it('switches to edit mode, showing an editable title input per tile', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));

    const titleInputs = screen.getAllByLabelText('Tile title') as HTMLInputElement[];
    expect(titleInputs.map((input) => input.value).sort()).toEqual(['Ad spend', 'Signups']);
  });

  it('adds a new tile in edit mode, defaulting to the first catalog metric', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add tile' }));

    expect(screen.getAllByLabelText('Tile title')).toHaveLength(3);
  });

  it('removes a tile in edit mode', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getAllByLabelText('Tile title')).toHaveLength(1);
  });

  it('cancel discards edits and returns to view mode', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Tile title')).not.toBeInTheDocument();
    expect(screen.getByText('Ad spend')).toBeInTheDocument();
    expect(screen.getByText('Signups')).toBeInTheDocument();
  });

  it('saves the edited layout (PUT the whole tiles array) and returns to view mode on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ board: {} }) } as Response);
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save layout' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/boards/board-1/tiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiles: [signupsTile] }),
    });
    expect(screen.queryByLabelText('Tile title')).not.toBeInTheDocument();
  });

  it('shows an inline error and stays in edit mode when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_board' }) } as Response);
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save layout' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That layout isn't valid — check every tile has a title, a registered metric, and fits the grid.",
    );
    expect(screen.getAllByLabelText('Tile title')).toHaveLength(2);
  });

  it('adding a tile with no registered metrics defaults it to heatmap, not an unusable big_number (KAN-62)', () => {
    renderEditor([], []);
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));
    expect(screen.getByText("Register a metric to add most tile types — a heatmap tile doesn't need one.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add tile' }));
    expect((screen.getByLabelText('Tile type') as HTMLSelectElement).value).toBe('heatmap');
    expect(screen.getByLabelText('Conversion event')).toBeInTheDocument();
  });

  it('switching a tile to heatmap shows a conversion-event input instead of the metric picker, clearing metricNames/dimensions (KAN-62)', () => {
    renderEditor([adSpendTile]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));

    expect(screen.getByLabelText('Metric')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tile type'), { target: { value: 'heatmap' } });

    expect(screen.queryByLabelText('Metric')).not.toBeInTheDocument();
    const conversionEventInput = screen.getByLabelText('Conversion event') as HTMLInputElement;
    expect(conversionEventInput.value).toBe('');

    fireEvent.change(conversionEventInput, { target: { value: 'activated' } });
    expect(conversionEventInput.value).toBe('activated');
  });

  it('swaps two tiles’ positions on drag-and-drop, without swapping their (different) sizes', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));

    const dragged = screen.getByTestId('tile-edit-card-tile-1');
    const target = screen.getByTestId('tile-edit-card-tile-2');
    const draggedParent = dragged.parentElement as HTMLElement;
    const targetParent = target.parentElement as HTMLElement;
    expect(draggedParent.style.gridColumn).toBe('1 / span 3');
    expect(draggedParent.style.gridRow).toBe('1 / span 2');
    expect(targetParent.style.gridColumn).toBe('7 / span 6');
    expect(targetParent.style.gridRow).toBe('1 / span 4');

    fireEvent.dragStart(dragged);
    fireEvent.drop(target);

    // Positions (the grid-line start) swapped...
    expect(draggedParent.style.gridColumn.split(' / ')[0]).toBe('7');
    expect(targetParent.style.gridColumn.split(' / ')[0]).toBe('1');
    // ...but each tile kept its own size (the `span` part) rather than
    // taking on the other tile's — dragging a small tile onto a large one
    // must not resize either.
    expect(draggedParent.style.gridColumn).toBe('7 / span 3');
    expect(draggedParent.style.gridRow).toBe('1 / span 2');
    expect(targetParent.style.gridColumn).toBe('1 / span 6');
    expect(targetParent.style.gridRow).toBe('1 / span 4');
  });
});
