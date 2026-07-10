import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateHookEndpointForm } from './create-hook-endpoint-form';
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
      <CreateHookEndpointForm
        orgId="org-1"
        projectId="project-1"
        environments={ENVIRONMENTS}
        hooksBaseUrl="https://api.example.com/v1/hooks"
      />
    </NextIntlClientProvider>,
  );
}

describe('CreateHookEndpointForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('defaults to none signature mode and submits the name/environment/mode', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ hookEndpointId: 'hook-1', signatureMode: 'none' }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Shopify orders' } });
    fireEvent.change(screen.getByLabelText('Environment'), { target: { value: 'env-prod' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create hook endpoint' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/hooks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Shopify orders', environmentId: 'env-prod', signatureMode: 'none' }),
        }),
      ),
    );
  });

  it('submits hmac_sha256 when selected, and shows the hook URL + secret exactly once', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ hookEndpointId: 'hook-2', signatureMode: 'hmac_sha256', rawSigningSecret: 'super-secret-value' }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Custom CRM' } });
    fireEvent.click(screen.getByRole('radio', { name: /HMAC-SHA256/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create hook endpoint' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/hooks',
        expect.objectContaining({
          body: JSON.stringify({ name: 'Custom CRM', environmentId: 'env-dev', signatureMode: 'hmac_sha256' }),
        }),
      ),
    );

    expect(await screen.findByText('super-secret-value')).toBeInTheDocument();
    expect(screen.getByText('https://api.example.com/v1/hooks/project-1/hook-2')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows only the hook URL (no secret block) for a none-mode endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ hookEndpointId: 'hook-3', signatureMode: 'none' }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Open hook' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create hook endpoint' }));

    expect(await screen.findByTestId('minted-hook-url-display')).toBeInTheDocument();
    expect(screen.queryByTestId('minted-hook-signing-secret-display')).not.toBeInTheDocument();
  });

  it('shows an inline error when creation fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create hook endpoint' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
