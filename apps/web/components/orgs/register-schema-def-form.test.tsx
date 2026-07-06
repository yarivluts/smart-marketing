import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RegisterSchemaDefForm } from './register-schema-def-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RegisterSchemaDefForm orgId="org-1" projectId="project-1" />
    </NextIntlClientProvider>,
  );
}

describe('RegisterSchemaDefForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the kind, name, and field rows', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ schemaDef: { id: 'schema-1', version: 1, status: 'active' } }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'event' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'order_completed' } });
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'order_id' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Required' }));
    fireEvent.click(screen.getByRole('button', { name: 'Register schema' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/schema-defs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            kind: 'event',
            name: 'order_completed',
            fields: [{ name: 'order_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: false }],
          }),
        }),
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('adds and removes field rows', () => {
    renderForm();
    expect(screen.getAllByLabelText('Field name')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(screen.getAllByLabelText('Field name')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getAllByLabelText('Field name')).toHaveLength(1);
  });

  it('shows a specific error for a duplicate schema, a generic one otherwise', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'duplicate_schema' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'order_completed' } });
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'order_id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register schema' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A schema with this kind and name is already registered in this project.',
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
