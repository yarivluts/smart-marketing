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
      <CreateHookEndpointForm orgId="org-1" projectId="project-1" environments={ENVIRONMENTS} />
    </NextIntlClientProvider>,
  );
}

describe('CreateHookEndpointForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits a "none"-mode endpoint without a signature header field', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ hookEndpointId: 'e1', hookId: 'tok' }) } as Response);
    renderForm();

    expect(screen.queryByLabelText('Signature header name')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Zapier' } });
    fireEvent.change(screen.getByLabelText('Environment'), { target: { value: 'env-prod' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create endpoint' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/hook-endpoints',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Zapier',
            environmentId: 'env-prod',
            signatureMode: 'none',
            signatureHeaderName: undefined,
          }),
        }),
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('shows and submits a signature header name once hmac_sha256 mode is selected', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ hookEndpointId: 'e1', hookId: 'tok' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'GitHub' } });
    fireEvent.change(screen.getByLabelText('Signature verification'), { target: { value: 'hmac_sha256' } });
    fireEvent.change(screen.getByLabelText('Signature header name'), { target: { value: 'X-Hub-Signature-256' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create endpoint' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/hook-endpoints',
        expect.objectContaining({
          body: JSON.stringify({
            name: 'GitHub',
            environmentId: 'env-dev',
            signatureMode: 'hmac_sha256',
            signatureHeaderName: 'X-Hub-Signature-256',
          }),
        }),
      ),
    );
  });

  it('shows an inline error when creation fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create endpoint' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't create this endpoint. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
