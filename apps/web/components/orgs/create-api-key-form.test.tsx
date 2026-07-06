import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateApiKeyForm } from './create-api-key-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const ENVIRONMENTS = [
  { id: 'env-dev', name: 'dev' as const },
  { id: 'env-prod', name: 'prod' as const },
];

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateApiKeyForm orgId="org-1" projectId="project-1" environments={ENVIRONMENTS} />
    </NextIntlClientProvider>,
  );
}

describe('CreateApiKeyForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the name, selected environment, and checked scopes', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ apiKeyId: 'key-1', keyPrefix: 'gos_live_ab', rawKey: 'gos_live_abcdef1234567890' }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI key' } });
    fireEvent.change(screen.getByLabelText('Environment'), { target: { value: 'env-prod' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'ingest.write' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'metrics.write' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/keys',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'CI key', environmentId: 'env-prod', scopes: ['ingest.write', 'metrics.write'] }),
        }),
      ),
    );
  });

  it('shows the minted raw key exactly once, and refreshes only after it is dismissed', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ apiKeyId: 'key-1', keyPrefix: 'gos_live_ab', rawKey: 'gos_live_abcdef1234567890' }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI key' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'ingest.write' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(await screen.findByText('gos_live_abcdef1234567890')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText('gos_live_abcdef1234567890')).not.toBeInTheDocument();
  });

  it('disables submit until at least one scope is checked', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'ingest.write' }));
    expect(screen.getByRole('button', { name: 'Create key' })).not.toBeDisabled();
  });

  it('shows an inline error when minting fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'ingest.write' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
