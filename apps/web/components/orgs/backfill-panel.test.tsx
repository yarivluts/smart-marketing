import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { BackfillPanel, type BackfillPanelProps } from './backfill-panel';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const baseProps: BackfillPanelProps = {
  orgId: 'org-1',
  projectId: 'proj-1',
  environmentId: 'env-dev',
  environmentLabel: 'Dev',
  canConfigure: true,
  endpoint: null,
  availableSchemas: [
    { kind: 'entity', name: 'customer' },
    { kind: 'event', name: 'signup' },
  ],
  backfills: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe('BackfillPanel', () => {
  it('registers an endpoint with the selected schemas and shows the secret exactly once', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: 'https://x.example/hook', schemas: [], signingSecret: 'whsec_abc' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithIntl(<BackfillPanel {...baseProps} />, { locale: 'en' });

    expect(screen.getByText('No backfill endpoint is registered for this environment yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Endpoint URL (https)'), { target: { value: 'https://x.example/hook' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save endpoint' }));

    await waitFor(() => expect(screen.getByTestId('backfill-secret')).toHaveTextContent('whsec_abc'));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/orgs/org-1/projects/proj-1/backfill-endpoint');
    // Entity schemas are preselected; the event schema is not.
    expect(JSON.parse(String(init.body))).toEqual({ environmentId: 'env-dev', url: 'https://x.example/hook', schemas: [{ kind: 'entity', name: 'customer' }], rotateSecret: false });
    expect(refresh).toHaveBeenCalled();
  });

  it('requests a backfill and follows each one through its steps', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ backfill: { status: 'delivered' } }), { status: 200 })));
    renderWithIntl(
      <BackfillPanel
        {...baseProps}
        endpoint={{ url: 'https://x.example/hook', schemas: [{ kind: 'entity', name: 'customer' }] }}
        backfills={[
          { backfillId: 'bf1', status: 'receiving', requestedAt: '2026-09-27T10:00:00Z', progress: { batches: 2, accepted: 8, duplicates: 6, quarantined: 0 } },
          { backfillId: 'bf0', status: 'failed', requestedAt: '2026-09-26T10:00:00Z', failureReason: 'The endpoint answered HTTP 401.', progress: { batches: 0, accepted: 0, duplicates: 0, quarantined: 0 } },
        ]}
      />,
      { locale: 'en' },
    );

    const receiving = within(screen.getByTestId('backfill-bf1'));
    expect(receiving.getByText('2 batches · 8 accepted · 6 duplicates · 0 quarantined')).toBeInTheDocument();
    expect(receiving.getAllByRole('listitem').map((step) => step.className.includes('text-success'))).toEqual([true, true, true, false]);
    expect(within(screen.getByTestId('backfill-bf0')).getByText('Failed: The endpoint answered HTTP 401.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Request backfill' }));
    await waitFor(() => expect(screen.getByText(/Backfill requested/)).toBeInTheDocument());
  });

  it('is read-only without project.configure', () => {
    renderWithIntl(<BackfillPanel {...baseProps} canConfigure={false} endpoint={{ url: 'https://x.example/hook', schemas: [{ kind: 'entity', name: 'customer' }] }} />, {
      locale: 'en',
    });
    expect(screen.queryByRole('button', { name: 'Request backfill' })).toBeNull();
    expect(screen.queryByText('Change endpoint')).toBeNull();
  });
});
