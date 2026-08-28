import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditWinRuleForm } from './edit-win-rule-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditWinRuleForm
        orgId="org-1"
        projectId="project-1"
        winRuleId="rule-1"
        initialName="Big order"
        schemaName="order_completed"
        initialFilters={[{ field: 'properties.amount', operator: '>', value: '100' }]}
        initialWinType="generic"
      />
    </NextIntlClientProvider>,
  );
}

describe('EditWinRuleForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts collapsed as an Edit button, not exposing the form fields', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('reveals the fields pre-filled, with the schema shown read-only', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Big order');
    expect(screen.getByText('order_completed')).toBeInTheDocument();
    expect(screen.queryByLabelText('Event')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Field')).toHaveValue('properties.amount');
    expect(screen.getByLabelText('Value')).toHaveValue('100');
  });

  it('submits the edited name/filters/winType via PATCH, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ winRule: { id: 'rule-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Even bigger order' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Win type'), { target: { value: 'reactivation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/win-rules/rule-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Even bigger order',
          filters: [{ field: 'properties.amount', operator: '>', value: '500' }],
          winType: 'reactivation',
        }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('shows structured reasons from an invalid_win_rule response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'invalid_win_rule', reasons: ['A win rule must have a non-empty name.'] }),
    } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A win rule must have a non-empty name.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a generic inline error and stays open when saving fails without reasons', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update this win rule. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('cancels back to the Edit button without submitting, discarding edits', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discard me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Big order');
  });

  it('disables Save while the name is blank or a filter is incomplete', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
