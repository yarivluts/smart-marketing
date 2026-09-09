import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ArchiveMetricDefButton } from './archive-metric-def-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ArchiveMetricDefButton orgId="org-1" projectId="project-1" name="ad_spend_real" />
    </NextIntlClientProvider>,
  );
}

describe('ArchiveMetricDefButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('confirms, POSTs the family name, and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(window.confirm).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/metric-defs/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ad_spend_real' }),
    });
  });

  it('does nothing when the confirmation is declined', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it('names the referencing formulas when the server refuses with 409', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 409, json: async () => ({ referencedBy: ['cost_per_signup'] }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Still referenced by active formula metric(s): cost_per_signup. Evolve or archive those first.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
