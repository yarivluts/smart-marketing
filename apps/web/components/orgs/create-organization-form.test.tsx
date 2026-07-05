import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateOrganizationForm } from './create-organization-form';
import messages from '../../messages/en.json';

const push = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateOrganizationForm />
    </NextIntlClientProvider>,
  );
}

describe('CreateOrganizationForm', () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('creates the organization and navigates to it', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ organizationId: 'org-123' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orgs/org-123'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Acme' }) }),
    );
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(push).not.toHaveBeenCalled();
  });
});
