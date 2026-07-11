import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateWinRuleForm } from './create-win-rule-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateWinRuleForm orgId="org-1" projectId="project-1" eventSchemaNames={['order_completed', 'signup']} />
    </NextIntlClientProvider>,
  );
}

describe('CreateWinRuleForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('disables submit until a name is entered', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Create win rule' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Big order' } });

    expect(screen.getByRole('button', { name: 'Create win rule' })).toBeEnabled();
  });

  it('creates a filterless win rule and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ winRule: { id: 'rule-1' } }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New signup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create win rule' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/win-rules',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'New signup', schemaName: 'order_completed', filters: [] }),
      }),
    );
  });

  it('adds a filter row and submits it', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ winRule: { id: 'rule-1' } }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Big order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));

    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'properties.amount' } });
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: '>' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create win rule' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/win-rules',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Big order',
          schemaName: 'order_completed',
          filters: [{ field: 'properties.amount', operator: '>', value: '100' }],
        }),
      }),
    );
  });

  it('shows an inline error when creation fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Big order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create win rule' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the win rule. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
