import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CustomerOwnerSelect } from './customer-owner-select';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const PEOPLE = [
  { id: 'person-alex', name: 'Alex Rep' },
  { id: 'person-sam', name: 'Sam Rep' },
];

function renderSelect(ownerPersonId: string | null = null): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CustomerOwnerSelect orgId="org-1" projectId="project-1" customerId="cus_1" ownerPersonId={ownerPersonId} people={PEOPLE} />
    </NextIntlClientProvider>,
  );
}

describe('CustomerOwnerSelect', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders every person plus an unassigned option, selecting the current owner', () => {
    renderSelect('person-sam');
    const select = screen.getByLabelText('Collections owner for cus_1');
    expect(select).toHaveValue('person-sam');
    expect(screen.getByRole('option', { name: 'Unassigned' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alex Rep' })).toBeInTheDocument();
  });

  it('PATCHes the new owner on change, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderSelect();

    fireEvent.change(screen.getByLabelText('Collections owner for cus_1'), { target: { value: 'person-alex' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/rep-collections/customers/cus_1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ ownerPersonId: 'person-alex' }) }),
    );
  });

  it('DELETEs when set back to unassigned, rather than PATCHing a null owner', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderSelect('person-alex');

    fireEvent.change(screen.getByLabelText('Collections owner for cus_1'), { target: { value: '' } });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/rep-collections/customers/cus_1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderSelect();

    fireEvent.change(screen.getByLabelText('Collections owner for cus_1'), { target: { value: 'person-alex' } });

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update the owner. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
