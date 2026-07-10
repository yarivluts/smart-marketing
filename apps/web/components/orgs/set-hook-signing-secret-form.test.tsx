import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SetHookSigningSecretForm } from './set-hook-signing-secret-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(hasSigningSecret: boolean): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SetHookSigningSecretForm orgId="org-1" projectId="project-1" hookEndpointId="endpoint-1" hasSigningSecret={hasSigningSecret} />
    </NextIntlClientProvider>,
  );
}

describe('SetHookSigningSecretForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows "Set secret" for an endpoint with no secret yet, and PUTs the value', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'set' }) } as Response);
    renderForm(false);

    expect(screen.getByLabelText('Signing secret')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Signing secret'), { target: { value: 'shh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set secret' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/hook-endpoints/endpoint-1/secret', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signingSecret: 'shh' }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByText('Secret saved.')).toBeInTheDocument();
  });

  it('shows "Rotate secret" once a secret already exists', () => {
    renderForm(true);
    expect(screen.getByLabelText('New signing secret')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rotate secret' })).toBeInTheDocument();
  });

  it('shows an inline error when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm(false);

    fireEvent.change(screen.getByLabelText('Signing secret'), { target: { value: 'shh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set secret' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't set the signing secret. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
