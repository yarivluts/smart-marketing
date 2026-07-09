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
  layout: { x: 3, y: 0, w: 3, h: 2 },
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

function renderEditor(tiles: BoardTileRow[] = [adSpendTile, signupsTile]): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoardGridEditor
        orgId="org-1"
        projectId="project-1"
        boardId="board-1"
        initialTiles={tiles}
        metricCatalog={metricCatalog}
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

  it('swaps two tiles’ positions on drag-and-drop', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));

    const dragged = screen.getByTestId('tile-edit-card-tile-1');
    const target = screen.getByTestId('tile-edit-card-tile-2');
    const draggedParent = dragged.parentElement as HTMLElement;
    const targetParent = target.parentElement as HTMLElement;
    expect(draggedParent.style.gridColumn).toBe('1 / span 3');
    expect(targetParent.style.gridColumn).toBe('4 / span 3');

    fireEvent.dragStart(dragged);
    fireEvent.drop(target);

    expect(draggedParent.style.gridColumn).toBe('4 / span 3');
    expect(targetParent.style.gridColumn).toBe('1 / span 3');
  });
});
