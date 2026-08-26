import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MetaLookalikeAudienceControls } from './meta-lookalike-audience-controls';
import type { MetaLookalikeAudienceView } from '@/lib/orgs/crm-sync-view';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const AUDIENCES: MetaLookalikeAudienceView[] = [
  { id: 'la-1', audienceId: 'audience-lookalike-1', name: 'Warm leads - Lookalike 5%', originAudienceId: 'audience-seed-1', country: 'US', ratio: 0.05, createdAt: '2026-08-20T00:00:00.000Z' },
];

function renderControls(
  overrides: Partial<{ hasSeedAudience: boolean; audiences: readonly MetaLookalikeAudienceView[] }> = {},
): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MetaLookalikeAudienceControls
        orgId="org-1"
        projectId="project-1"
        installId="install-1"
        hasSeedAudience={overrides.hasSeedAudience ?? true}
        audiences={overrides.audiences ?? []}
      />
    </NextIntlClientProvider>,
  );
}

describe('MetaLookalikeAudienceControls', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the no-seed-audience message and no form when the install has never synced', () => {
    renderControls({ hasSeedAudience: false });
    expect(screen.getByText('Sync a segment to this plugin at least once first — a Lookalike Audience needs an existing Custom Audience to expand from.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Lookalike Audience' })).not.toBeInTheDocument();
  });

  it('POSTs a create request with the entered name/country/ratio and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ audience: { id: 'la-2' } }) } as Response);
    renderControls();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Warm leads - Lookalike 5%' } });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'us' } });
    fireEvent.change(screen.getByLabelText('Similarity (%)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Lookalike Audience' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/plugins/install-1/lookalike-audiences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Warm leads - Lookalike 5%', country: 'US', ratio: 0.1 }),
    });
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderControls();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Warm leads' } });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'US' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Lookalike Audience' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't create the Lookalike Audience. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the empty-list message when no Lookalike Audiences have been created yet', () => {
    renderControls({ audiences: [] });
    fireEvent.click(screen.getByText('Created Lookalike Audiences'));
    expect(screen.getByText('No Lookalike Audiences created yet.')).toBeInTheDocument();
  });

  it('lists every created Lookalike Audience', () => {
    renderControls({ audiences: AUDIENCES });
    fireEvent.click(screen.getByText('Created Lookalike Audiences'));
    expect(screen.getByText('Warm leads - Lookalike 5% · 5% · US · created 2026-08-20T00:00:00.000Z')).toBeInTheDocument();
  });
});
