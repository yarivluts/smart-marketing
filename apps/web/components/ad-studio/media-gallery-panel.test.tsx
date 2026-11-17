import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'next-intl';
import en from '../../messages/en.json';
import { MediaGalleryPanel } from './media-gallery-panel';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function wrap(ui: React.ReactElement) {
  return render(
    <IntlProvider locale="en" messages={en}>
      {ui}
    </IntlProvider>,
  );
}

describe('MediaGalleryPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('loads items, filters by source/kind, selects in picker mode, and deletes uploaded assets', async () => {
    const items = [
      {
        id: 'asset-1',
        assetId: 'asset-1',
        kind: 'image',
        source: 'upload',
        label: 'Hero Dashboard',
        description: 'Main workspace',
        mediaUrl: '/api/orgs/o1/projects/p1/ad-studio/gallery/asset-1/media',
        thumbnailUrl: '/api/orgs/o1/projects/p1/ad-studio/gallery/asset-1/media',
        mimeType: 'image/png',
        durationSeconds: null,
        createdOn: '2026-11-17T00:00:00Z',
        deletable: true,
        sourceRef: { type: 'gallery', assetId: 'asset-1' },
      },
      {
        id: 'demo-vid:rec1:seg1',
        assetId: null,
        kind: 'video',
        source: 'walkthrough',
        label: 'Reports Tour',
        description: 'Live reports chart',
        mediaUrl: '/api/orgs/o1/projects/p1/ad-studio/demo-recordings/rec1/media',
        thumbnailUrl: null,
        mimeType: 'video/mp4',
        durationSeconds: 5,
        createdOn: '2026-11-17T00:00:00Z',
        deletable: false,
        sourceRef: { type: 'demo_segment', recordingId: 'rec1', segmentId: 'seg1' },
      },
    ];

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return new Response(JSON.stringify({ deleted: 'asset-1' }), { status: 200 });
      }
      return new Response(JSON.stringify({ items }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const onSelect = vi.fn();
    wrap(<MediaGalleryPanel orgId="o1" projectId="p1" onSelect={onSelect} />);

    await screen.findByTestId('ad-studio-gallery-item-asset-1');
    expect(screen.getByTestId('ad-studio-gallery-item-demo-vid:rec1:seg1')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Scanned pages' }));
    expect(screen.queryByTestId('ad-studio-gallery-item-asset-1')).toBeNull();
    expect(screen.getByTestId('ad-studio-gallery-item-demo-vid:rec1:seg1')).toBeTruthy();

    fireEvent.click(screen.getByTestId('ad-studio-gallery-select-demo-vid:rec1:seg1'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'demo-vid:rec1:seg1' }));

    fireEvent.click(screen.getByRole('tab', { name: 'All (2)' }));
    fireEvent.click(screen.getByTestId('ad-studio-gallery-delete-asset-1'));
    await waitFor(() => {
      expect(screen.queryByTestId('ad-studio-gallery-item-asset-1')).toBeNull();
    });
  });

  it('uploads a media file from the computer and announces it in the gallery', async () => {
    const uploaded = {
      id: 'asset-new',
      assetId: 'asset-new',
      kind: 'image',
      source: 'upload',
      label: 'product screen',
      description: '',
      mediaUrl: '/api/orgs/o1/projects/p1/ad-studio/gallery/asset-new/media',
      thumbnailUrl: '/api/orgs/o1/projects/p1/ad-studio/gallery/asset-new/media',
      mimeType: 'image/png',
      durationSeconds: null,
      createdOn: '2026-11-17T00:00:00Z',
      deletable: true,
      sourceRef: { type: 'gallery', assetId: 'asset-new' },
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ item: uploaded }), { status: 201 });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    wrap(<MediaGalleryPanel orgId="o1" projectId="p1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const input = screen.getByTestId('ad-studio-gallery-file-input') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'product-screen.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByTestId('ad-studio-gallery-item-asset-new');
    expect(screen.getByRole('status').textContent).toBe('Added to project gallery.');
  });
});
