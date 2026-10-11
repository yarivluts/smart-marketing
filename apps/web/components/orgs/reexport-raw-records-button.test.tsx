import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ReexportRawRecordsButton } from './reexport-raw-records-button';
import messages from '../../messages/en.json';

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ReexportRawRecordsButton orgId="org-1" projectId="project-1" />
    </NextIntlClientProvider>,
  );
}

describe('ReexportRawRecordsButton', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs the re-export and shows the tally', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ attempted: 5, exported: 5, failed: 0 }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Re-export records to warehouse' }));

    expect(await screen.findByText('5 of 5 record(s) exported, 0 failed')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/ingest-health/reexport-raw-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  });

  it('explains a 409 as "no warehouse export configured"', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 409 } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Re-export records to warehouse' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This deployment has no warehouse export configured, so there is nothing to backfill into.');
  });

  it('shows a generic inline error for any other failure', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Re-export records to warehouse' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't re-export raw records. Please try again.");
  });
});
