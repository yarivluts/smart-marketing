import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTvBoardFrame,
  fetchTvPairingStatus,
  fetchTvRotationManifest,
  requestTvPairing,
  tvWinFeedUrl,
} from './tv-client';

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

describe('tv-client (KAN-67)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requestTvPairing POSTs with no auth (nothing to authenticate yet)', async () => {
    await requestTvPairing();
    expect(fetch).toHaveBeenCalledWith('/api/tv-pairing', { method: 'POST' });
  });

  it('fetchTvPairingStatus authenticates via an Authorization header, never a URL query param', async () => {
    await fetchTvPairingStatus('secret-token');
    expect(fetch).toHaveBeenCalledWith('/api/tv-pairing/status', { headers: { Authorization: 'Bearer secret-token' } });
  });

  it('fetchTvRotationManifest authenticates via an Authorization header', async () => {
    await fetchTvRotationManifest('secret-token');
    expect(fetch).toHaveBeenCalledWith('/api/tv-pairing/rotation', { headers: { Authorization: 'Bearer secret-token' } });
  });

  it('fetchTvBoardFrame authenticates via an Authorization header, keeping only boardId in the URL', async () => {
    await fetchTvBoardFrame('secret-token', 'board-1');
    expect(fetch).toHaveBeenCalledWith('/api/tv-pairing/board?boardId=board-1', { headers: { Authorization: 'Bearer secret-token' } });
  });

  it('tvWinFeedUrl still puts the token in the URL — EventSource cannot set a custom header', () => {
    expect(tvWinFeedUrl('secret-token')).toBe('/api/tv-pairing/win-feed?token=secret-token');
  });
});
