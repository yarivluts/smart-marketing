import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SegmentCrmSyncControls } from './segment-crm-sync-controls';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const INSTALLS = [
  { id: 'install-1', pluginId: 'com.growthos.crm-webhook' },
  { id: 'install-2', pluginId: 'com.example.other-action' },
];

function renderControls(overrides: Partial<{ actionInstalls: typeof INSTALLS; latestRun: { id: string; status: 'running' | 'succeeded' | 'failed'; startedAt: string; finishedAt: string | null; attempts: number | null; recordsAttempted: number; recordsPushed: number | null; errorMessage: string | null } | null }> = {}): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SegmentCrmSyncControls
        orgId="org-1"
        projectId="project-1"
        segmentId="segment-1"
        actionInstalls={overrides.actionInstalls ?? INSTALLS}
        latestRun={overrides.latestRun ?? null}
      />
    </NextIntlClientProvider>,
  );
}

describe('SegmentCrmSyncControls', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs a sync request for the first install and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ run: { status: 'succeeded' } }) } as Response);
    renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Sync to CRM' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/segments/segment-1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId: 'install-1' }),
    });
  });

  it('POSTs the newly selected install after the user changes it', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ run: { status: 'succeeded' } }) } as Response);
    renderControls();

    fireEvent.change(screen.getByLabelText('CRM sync destination'), { target: { value: 'install-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sync to CRM' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/segments/segment-1/sync', expect.objectContaining({ body: JSON.stringify({ installId: 'install-2' }) }));
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Sync to CRM' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sync this segment. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a fallback message and no button when the project has no action-type plugin installs', () => {
    renderControls({ actionInstalls: [] });
    expect(screen.getByText("Install a CRM-sync plugin (Plugins page) to export this list.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync to CRM' })).not.toBeInTheDocument();
  });

  it('shows the last succeeded run’s pushed count', () => {
    renderControls({ latestRun: { id: 'run-1', status: 'succeeded', startedAt: '2026-08-20T00:00:00.000Z', finishedAt: '2026-08-20T00:00:05.000Z', attempts: 1, recordsAttempted: 3, recordsPushed: 3, errorMessage: null } });
    expect(screen.getByText('Last synced 3 records')).toBeInTheDocument();
  });

  it('shows a failed-run message for the last failed run', () => {
    renderControls({ latestRun: { id: 'run-1', status: 'failed', startedAt: '2026-08-20T00:00:00.000Z', finishedAt: '2026-08-20T00:00:05.000Z', attempts: 1, recordsAttempted: 3, recordsPushed: null, errorMessage: 'boom' } });
    expect(screen.getByText('Last sync failed')).toBeInTheDocument();
  });
});
