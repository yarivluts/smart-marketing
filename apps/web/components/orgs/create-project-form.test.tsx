import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateProjectForm } from './create-project-form';
import messages from '../../messages/en.json';

const push = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateProjectForm orgId="org-1" />
    </NextIntlClientProvider>,
  );
}

describe('CreateProjectForm', () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('creates the project and navigates to setup checklist', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ projectId: 'proj-123' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByTestId('project-name-input'), { target: { value: 'Growth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orgs/org-1/projects/proj-123/setup-checklist'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Growth',
          platformType: 'web',
          businessModel: 'saas_subscription',
          transactionType: 'monthly_recurring',
          primaryStack: 'custom_web',
          vertical: 'saas_subscription',
        }),
      }),
    );
  });

  it('allows selecting an e-commerce physical goods profile', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ projectId: 'store-999' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByTestId('project-name-input'), { target: { value: 'My Fashion Store' } });
    // Click E-Commerce physical goods
    const ecomBtn = screen.getByText('E-Commerce (Physical Goods)');
    fireEvent.click(ecomBtn);

    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orgs/org-1/projects/store-999/setup-checklist'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'My Fashion Store',
          platformType: 'web',
          businessModel: 'ecommerce_physical',
          transactionType: 'one_time',
          primaryStack: 'shopify',
          vertical: 'ecommerce_physical',
        }),
      }),
    );
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByTestId('project-name-input'), { target: { value: 'Growth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(push).not.toHaveBeenCalled();
  });
});
