import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OrganizationSettingsForm } from './organization-settings-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrganizationSettingsForm
        orgId="org-1"
        initialName="Acme Inc"
        initialSlug="acme"
        initialBillingEmail="billing@acme.test"
      />
    </NextIntlClientProvider>,
  );
}

describe('OrganizationSettingsForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('prefills the current name/slug/billing email', () => {
    renderForm();
    expect(screen.getByLabelText('Organization name')).toHaveValue('Acme Inc');
    expect(screen.getByLabelText('Slug')).toHaveValue('acme');
    expect(screen.getByLabelText('Billing contact email')).toHaveValue('billing@acme.test');
  });

  it('submits the edited fields and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'acme-corp' } });
    fireEvent.change(screen.getByLabelText('Billing contact email'), { target: { value: 'ap@acme.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Corp', slug: 'acme-corp', billingEmail: 'ap@acme.test' }),
    });
  });

  it('rejects a blank name client-side without calling fetch', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Organization name is required.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save these settings. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
