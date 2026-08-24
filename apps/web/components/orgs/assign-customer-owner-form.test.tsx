import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AssignCustomerOwnerForm } from './assign-customer-owner-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const PEOPLE = [
  { id: 'person-alex', name: 'Alex Rep' },
  { id: 'person-sam', name: 'Sam Rep' },
];

function renderForm(people = PEOPLE): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AssignCustomerOwnerForm orgId="org-1" projectId="project-1" people={people} />
    </NextIntlClientProvider>,
  );
}

describe('AssignCustomerOwnerForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('tells the user to add people first when the org has none', () => {
    renderForm([]);
    expect(screen.getByText("Add people to this organization's resource library before assigning customer owners.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign owner' })).not.toBeInTheDocument();
  });

  it('disables submit until a customer id is entered', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Assign owner' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'cus_1' } });
    expect(screen.getByRole('button', { name: 'Assign owner' })).toBeEnabled();
  });

  it('PATCHes the assignment, resets the customer id, and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'cus_1' } });
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'person-sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign owner' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/rep-collections/customers/cus_1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ ownerPersonId: 'person-sam' }) }),
    );
    expect(screen.getByLabelText('Customer')).toHaveValue('');
  });

  it('trims the customer id before putting it in the URL', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: '  cus_padded  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign owner' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/rep-collections/customers/cus_padded', expect.anything());
  });

  it('shows an inline error and keeps the entered customer id when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'cus_1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign owner' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update the owner. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Customer')).toHaveValue('cus_1');
  });
});
