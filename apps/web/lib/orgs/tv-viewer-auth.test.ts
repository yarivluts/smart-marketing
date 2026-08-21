import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { TvPairingModel } from '@growthos/firebase-orm-models';
import type { Result } from '@growthos/shared';

const { requireClaimedTvPairingMock } = vi.hoisted(() => ({
  requireClaimedTvPairingMock: vi.fn(),
}));
vi.mock('@/lib/orgs/queries', () => ({ requireClaimedTvPairing: requireClaimedTvPairingMock }));

import { extractTvDeviceToken, requireTvViewer } from './tv-viewer-auth';

function requestWith(options: { headers?: Record<string, string>; query?: Record<string, string> } = {}): NextRequest {
  const url = new URL('https://growthos.test/api/tv-pairing/win-feed');
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { headers: options.headers });
}

function pairing(overrides: Partial<TvPairingModel> = {}): TvPairingModel {
  return {
    device_token: 'tok-1',
    claimed: true,
    organization_id: 'org-1',
    project_id: 'project-1',
    ...overrides,
  } as unknown as TvPairingModel;
}

describe('extractTvDeviceToken', () => {
  it('reads the token from a Bearer authorization header', () => {
    expect(extractTvDeviceToken(requestWith({ headers: { authorization: 'Bearer tok-abc' } }))).toBe('tok-abc');
  });

  it('matches the Bearer scheme case-insensitively', () => {
    expect(extractTvDeviceToken(requestWith({ headers: { authorization: 'bearer tok-abc' } }))).toBe('tok-abc');
    expect(extractTvDeviceToken(requestWith({ headers: { authorization: 'BEARER tok-abc' } }))).toBe('tok-abc');
  });

  it('falls back to the ?token= query param when no authorization header is present', () => {
    expect(extractTvDeviceToken(requestWith({ query: { token: 'tok-query' } }))).toBe('tok-query');
  });

  it('falls back to the query param when the authorization header uses a different scheme', () => {
    expect(
      extractTvDeviceToken(requestWith({ headers: { authorization: 'Basic tok-abc' }, query: { token: 'tok-query' } })),
    ).toBe('tok-query');
  });

  it('falls back to the query param when the Bearer header has no value', () => {
    expect(
      extractTvDeviceToken(requestWith({ headers: { authorization: 'Bearer' }, query: { token: 'tok-query' } })),
    ).toBe('tok-query');
  });

  it('prefers the header over the query param when both are present', () => {
    expect(
      extractTvDeviceToken(requestWith({ headers: { authorization: 'Bearer tok-header' }, query: { token: 'tok-query' } })),
    ).toBe('tok-header');
  });

  it('returns null when neither the header nor the query param is present', () => {
    expect(extractTvDeviceToken(requestWith())).toBeNull();
  });
});

describe('requireTvViewer', () => {
  beforeEach(() => {
    requireClaimedTvPairingMock.mockReset();
  });

  it('returns 401 unauthorized when no token is presented at all', async () => {
    const result = await requireTvViewer(requestWith());

    expect(result.pairing).toBeUndefined();
    expect(result.error?.status).toBe(401);
    await expect(result.error?.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(requireClaimedTvPairingMock).not.toHaveBeenCalled();
  });

  it('returns 401 unauthorized when the presented token is unknown, unclaimed, or expired', async () => {
    requireClaimedTvPairingMock.mockResolvedValue({ ok: false, error: 'not found' } satisfies Result<TvPairingModel, string>);

    const result = await requireTvViewer(requestWith({ headers: { authorization: 'Bearer tok-1' } }));

    expect(result.pairing).toBeUndefined();
    expect(result.error?.status).toBe(401);
    await expect(result.error?.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(requireClaimedTvPairingMock).toHaveBeenCalledWith('tok-1');
  });

  it('returns 401 unauthorized (not a crash) when a claimed pairing is somehow missing org/project ids', async () => {
    requireClaimedTvPairingMock.mockResolvedValue({
      ok: true,
      value: pairing({ organization_id: undefined, project_id: undefined }),
    } satisfies Result<TvPairingModel, string>);

    const result = await requireTvViewer(requestWith({ headers: { authorization: 'Bearer tok-1' } }));

    expect(result.pairing).toBeUndefined();
    expect(result.error?.status).toBe(401);
    await expect(result.error?.json()).resolves.toEqual({ error: 'unauthorized' });
  });

  it('returns the pairing + scoped org/project ids for a validly claimed token', async () => {
    const value = pairing();
    requireClaimedTvPairingMock.mockResolvedValue({ ok: true, value } satisfies Result<TvPairingModel, string>);

    const result = await requireTvViewer(requestWith({ headers: { authorization: 'Bearer tok-1' } }));

    expect(result.error).toBeUndefined();
    expect(result.pairing).toBe(value);
    expect(result.organizationId).toBe('org-1');
    expect(result.projectId).toBe('project-1');
  });

  it('resolves the token via the ?token= fallback for callers that cannot set a header', async () => {
    const value = pairing();
    requireClaimedTvPairingMock.mockResolvedValue({ ok: true, value } satisfies Result<TvPairingModel, string>);

    const result = await requireTvViewer(requestWith({ query: { token: 'tok-1' } }));

    expect(result.error).toBeUndefined();
    expect(requireClaimedTvPairingMock).toHaveBeenCalledWith('tok-1');
  });
});
