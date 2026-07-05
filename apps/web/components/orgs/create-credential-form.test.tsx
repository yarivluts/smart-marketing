import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateCredentialForm } from './create-credential-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateCredentialForm orgId="org-1" />
    </NextIntlClientProvider>,
  );
}

describe('CreateCredentialForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the name, provider, and parsed comma-separated scopes, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ credentialId: 'c1' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Agency Meta MCC' } });
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'meta_ads' } });
    fireEvent.change(screen.getByLabelText('Available scopes'), { target: { value: ' act_1, act_2 ,act_3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add credential' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resources/credentials',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Agency Meta MCC', provider: 'meta_ads', availableScopes: ['act_1', 'act_2', 'act_3'] }),
      }),
    );
  });

  it('shows an inline error when creation fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add credential' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
