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

  it('reveals every field pre-filled from the current definition', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Big order');
    expect(screen.getByLabelText('Win type')).toHaveValue('generic');
    expect(screen.getByLabelText('Field')).toHaveValue('properties.amount');
    expect(screen.getByLabelText('Operator')).toHaveValue('>');
    expect(screen.getByLabelText('Value')).toHaveValue('100');
  });

  it('submits the edited name/filters/win type via PATCH, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ winRule: { id: 'rule-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Enterprise order' } });
    fireEvent.change(screen.getByLabelText('Win type'), { target: { value: 'reactivation' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save win rule' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/win-rules/rule-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Enterprise order',
          filters: [{ field: 'properties.amount', operator: '>', value: '500' }],
          winType: 'reactivation',
        }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('adds and removes filter rows', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(screen.getAllByLabelText('Field')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getAllByLabelText('Field')).toHaveLength(1);
  });

  it('disables saving once the name is emptied', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } });

    expect(screen.getByRole('button', { name: 'Save win rule' })).toBeDisabled();
  });

  it('disables saving once a filter field is emptied', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: '' } });

    expect(screen.getByRole('button', { name: 'Save win rule' })).toBeDisabled();
  });

  it('shows an inline error and stays open when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save win rule' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save this win rule. Please try again.");
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
});
