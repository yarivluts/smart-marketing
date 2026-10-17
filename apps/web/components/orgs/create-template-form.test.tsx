import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateTemplateForm } from './create-template-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateTemplateForm orgId="org-1" />
    </NextIntlClientProvider>,
  );
}

describe('CreateTemplateForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the name and selected type, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ templateId: 't1' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard SaaS Funnel' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'dashboard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add template' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resources/templates',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Standard SaaS Funnel', type: 'dashboard' }),
      }),
    );
  });

  it('shows an inline error when creation fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add template' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not add it. Nothing was saved, so please try again in a moment.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('says the connection is down when the request cannot be sent', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add template' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We cannot reach GrowthOS. Check your internet connection and try again - nothing was saved.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
