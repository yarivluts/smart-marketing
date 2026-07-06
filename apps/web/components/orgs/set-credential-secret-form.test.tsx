import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SetCredentialSecretForm } from './set-credential-secret-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(hasSecret: boolean): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SetCredentialSecretForm orgId="org-1" credentialId="cred-1" hasSecret={hasSecret} />
    </NextIntlClientProvider>,
  );
}

describe('SetCredentialSecretForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows "no secret set" and a "Set secret" button before any secret exists', () => {
    renderForm(false);
    expect(screen.getByText('No secret set')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set secret' })).toBeInTheDocument();
  });

  it('shows "secret set" and an "Update secret" button once a secret exists', () => {
    renderForm(true);
    expect(screen.getByText('Secret set')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update secret' })).toBeInTheDocument();
  });

  it('PUTs the entered secret and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'set' }) } as Response);
    renderForm(false);

    fireEvent.change(screen.getByLabelText('Secret'), { target: { value: 'sk_live_abc123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set secret' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resources/credentials/cred-1/secret',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ secret: 'sk_live_abc123' }) }),
    );
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm(false);

    fireEvent.change(screen.getByLabelText('Secret'), { target: { value: 'sk_live_abc123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set secret' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that secret. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it('disables the submit button until a secret is typed', () => {
    renderForm(false);
    expect(screen.getByRole('button', { name: 'Set secret' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Secret'), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Set secret' })).not.toBeDisabled();
  });
});
