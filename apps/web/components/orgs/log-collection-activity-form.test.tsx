import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LogCollectionActivityForm } from './log-collection-activity-form';
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
      <LogCollectionActivityForm orgId="org-1" projectId="project-1" people={people} />
    </NextIntlClientProvider>,
  );
}

describe('LogCollectionActivityForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('tells the user to add people first when the org has none', () => {
    renderForm([]);
    expect(screen.getByText("Add people to this organization's resource library before logging collections activity.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log activity' })).not.toBeInTheDocument();
  });

  it('disables submit until a customer id is entered', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Log activity' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'cus_1' } });
    expect(screen.getByRole('button', { name: 'Log activity' })).toBeEnabled();
  });

  it('POSTs the activity, resets the customer id, and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'cus_1' } });
    fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'payment_followup' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Sent a reminder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log activity' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/rep-collections/activities',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ customerId: 'cus_1', personId: 'person-alex', activityType: 'payment_followup', note: 'Sent a reminder' }),
      }),
    );
    expect(screen.getByLabelText('Customer')).toHaveValue('');
  });

  it('omits an all-whitespace note rather than sending it', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'cus_1' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log activity' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/rep-collections/activities',
      expect.objectContaining({ body: JSON.stringify({ customerId: 'cus_1', personId: 'person-alex', activityType: 'call' }) }),
    );
  });

  it('shows an inline error and keeps the entered customer id when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'cus_1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log activity' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't log the activity. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Customer')).toHaveValue('cus_1');
  });
});
