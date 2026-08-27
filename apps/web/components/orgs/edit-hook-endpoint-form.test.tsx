import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditHookEndpointForm } from './edit-hook-endpoint-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(initialSignatureHeaderName?: string): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditHookEndpointForm
        orgId="org-1"
        projectId="project-1"
        hookEndpointId="endpoint-1"
        initialName="Shopify webhook"
        initialSignatureHeaderName={initialSignatureHeaderName}
      />
    </NextIntlClientProvider>,
  );
}

describe('EditHookEndpointForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts collapsed as an Edit button, not exposing the form fields', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('reveals the name field pre-filled, with no signature header field for a "none"-mode endpoint', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Shopify webhook');
    expect(screen.queryByLabelText('Signature header name')).not.toBeInTheDocument();
  });

  it('reveals both fields pre-filled for an hmac_sha256-mode endpoint', () => {
    renderForm('X-Hub-Signature-256');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Shopify webhook');
    expect(screen.getByLabelText('Signature header name')).toHaveValue('X-Hub-Signature-256');
  });

  it('submits the edited name via PATCH for a "none"-mode endpoint, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ hookEndpoint: { id: 'endpoint-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save endpoint' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/hook-endpoints/endpoint-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated name', signatureHeaderName: undefined }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('submits the edited name and signatureHeaderName via PATCH for an hmac_sha256-mode endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ hookEndpoint: { id: 'endpoint-1' } }) } as Response);
    renderForm('X-Hub-Signature-256');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated name' } });
    fireEvent.change(screen.getByLabelText('Signature header name'), { target: { value: 'X-Shopify-Hmac-Sha256' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save endpoint' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/hook-endpoints/endpoint-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated name', signatureHeaderName: 'X-Shopify-Hmac-Sha256' }),
      }),
    );
  });

  it('shows a specific error when signatureHeaderName is required but missing, a generic one otherwise', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'missing_signature_header_name' }) } as Response);
    renderForm('X-Hub-Signature-256');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Signature header name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save endpoint' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A signature header name is required for an HMAC-SHA256 endpoint.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a generic inline error and stays open when saving fails without a known error code', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save endpoint' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save this endpoint. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('cancels back to the Edit button without submitting, discarding edits', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discard me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Shopify webhook');
  });
});
