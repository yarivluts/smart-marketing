import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EvolveSchemaDefForm } from './evolve-schema-def-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();
const onCancel = vi.fn();
const onSuccess = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const INITIAL_FIELDS = [
  { name: 'order_id', type: 'string' as const, isRequired: true, isPii: false, isIdentityKey: false },
];

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EvolveSchemaDefForm
        orgId="org-1"
        projectId="project-1"
        kind="event"
        name="order_completed"
        initialFields={INITIAL_FIELDS}
        onCancel={onCancel}
        onSuccess={onSuccess}
      />
    </NextIntlClientProvider>,
  );
}

describe('EvolveSchemaDefForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    onCancel.mockClear();
    onSuccess.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('is prefilled from the latest version and submits the (possibly edited) fields to the evolve route', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ schemaDef: { id: 'schema-2', version: 2, status: 'active' } }),
    } as Response);
    renderForm();

    expect(screen.getByDisplayValue('order_id')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    fireEvent.change(screen.getAllByLabelText('Field name')[1], { target: { value: 'currency' } });

    fireEvent.click(screen.getByRole('button', { name: 'Evolve schema' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/schema-defs/evolve',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            kind: 'event',
            name: 'order_completed',
            fields: [
              { name: 'order_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false },
              { name: 'currency', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
            ],
          }),
        }),
      ),
    );
    expect(refresh).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows the breaking-change violations returned by the API', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'breaking_change', violations: ['Field "order_id" was removed.'] }),
    } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Evolve schema' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This change would break existing consumers: Field "order_id" was removed.',
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
