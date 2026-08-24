import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateRepCollectionEntryForm } from './create-rep-collection-entry-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const people = [
  { id: 'person-1', name: 'Alex Rep' },
  { id: 'person-2', name: 'Sam Rep' },
];

function renderForm(signal?: { rawRecordId: string; amount: number; occurredAt: string; customerId: string }) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateRepCollectionEntryForm orgId="org-1" projectId="project-1" people={people} signal={signal} />
    </NextIntlClientProvider>,
  );
}

describe('CreateRepCollectionEntryForm (manual)', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('disables submit until company, amount, and occurredAt are filled', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Log collection' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme Inc' } });
    expect(screen.getByRole('button', { name: 'Log collection' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    expect(screen.getByRole('button', { name: 'Log collection' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('When'), { target: { value: '2026-08-24' } });
    expect(screen.getByRole('button', { name: 'Log collection' })).toBeEnabled();
  });

  it('creates a fully manual entry with no rep, no plan, no note, and no sourceRawRecordId', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme Inc' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('When'), { target: { value: '2026-08-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log collection' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/rep-collections',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          orgPersonId: null,
          company: 'Acme Inc',
          collectionType: 'upgrade',
          planFrom: undefined,
          planTo: undefined,
          amount: 500,
          occurredAt: '2026-08-24',
          note: undefined,
          sourceRawRecordId: undefined,
        }),
      }),
    );
  });

  it('includes the rep, type, plan, and note when filled in', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme Inc' } });
    fireEvent.change(screen.getByLabelText('Rep'), { target: { value: 'person-1' } });
    fireEvent.change(screen.getByLabelText('How'), { target: { value: 'expansion' } });
    fireEvent.change(screen.getByLabelText('Plan from'), { target: { value: 'Starter' } });
    fireEvent.change(screen.getByLabelText('Plan to'), { target: { value: 'Pro' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '750' } });
    fireEvent.change(screen.getByLabelText('When'), { target: { value: '2026-08-24' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Upsell after QBR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log collection' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/rep-collections',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          orgPersonId: 'person-1',
          company: 'Acme Inc',
          collectionType: 'expansion',
          planFrom: 'Starter',
          planTo: 'Pro',
          amount: 750,
          occurredAt: '2026-08-24',
          note: 'Upsell after QBR',
          sourceRawRecordId: undefined,
        }),
      }),
    );
  });

  it('resets every field (including collectionType) after a successful submit', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme Inc' } });
    fireEvent.change(screen.getByLabelText('How'), { target: { value: 'save' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('When'), { target: { value: '2026-08-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log collection' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByLabelText('Company')).toHaveValue('');
    expect(screen.getByLabelText('How')).toHaveValue('upgrade');
    expect(screen.getByLabelText('Amount')).toHaveValue(null);
    expect(screen.getByLabelText('When')).toHaveValue('');
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme Inc' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('When'), { target: { value: '2026-08-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log collection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not log this collection. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('CreateRepCollectionEntryForm (billing signal confirmation)', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  const signal = { rawRecordId: 'raw-1', amount: 42, occurredAt: '2026-08-24T10:00:00.000Z', customerId: 'cus_1' };

  it('pre-fills company from the customer id, amount, and date from the signal', () => {
    renderForm(signal);
    expect(screen.getByLabelText('Company')).toHaveValue('cus_1');
    expect(screen.getByLabelText('Amount')).toHaveValue(42);
    expect(screen.getByLabelText('When')).toHaveValue('2026-08-24');
    expect(screen.getByRole('button', { name: 'Add to ledger' })).toBeEnabled();
  });

  it('submits with sourceRawRecordId set to the signal, still allowing the rep and amount to be edited first', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderForm(signal);

    fireEvent.change(screen.getByLabelText('Rep'), { target: { value: 'person-2' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to ledger' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/rep-collections',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          orgPersonId: 'person-2',
          company: 'cus_1',
          collectionType: 'upgrade',
          planFrom: undefined,
          planTo: undefined,
          amount: 45,
          occurredAt: '2026-08-24',
          note: undefined,
          sourceRawRecordId: 'raw-1',
        }),
      }),
    );
  });
});
