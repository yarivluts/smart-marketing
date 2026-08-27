import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditCredentialForm } from './edit-credential-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(initialAvailableScopes: readonly string[] = []): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditCredentialForm
        orgId="org-1"
        credentialId="credential-1"
        initialName="Main Google Ads MCC"
        initialAvailableScopes={initialAvailableScopes}
      />
    </NextIntlClientProvider>,
  );
}

describe('EditCredentialForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts collapsed as an Edit button, not exposing the form fields', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('reveals the fields pre-filled with the current name and a comma-joined scope list', () => {
    renderForm(['act_111', 'act_222']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Main Google Ads MCC');
    expect(screen.getByLabelText('Available scopes')).toHaveValue('act_111, act_222');
  });

  it('pre-fills an empty scopes input when there are no available scopes yet', () => {
    renderForm([]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Available scopes')).toHaveValue('');
  });

  it('submits the edited name and parsed scope list via PATCH, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ credential: { id: 'credential-1' } }) } as Response);
    renderForm(['act_111']);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed MCC' } });
    fireEvent.change(screen.getByLabelText('Available scopes'), { target: { value: 'act_111, act_222 ,  act_333' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resources/credentials/credential-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renamed MCC', availableScopes: ['act_111', 'act_222', 'act_333'] }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('submits an empty availableScopes array when the scopes input is cleared', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ credential: { id: 'credential-1' } }) } as Response);
    renderForm(['act_111']);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Available scopes'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resources/credentials/credential-1',
      expect.objectContaining({ body: JSON.stringify({ name: 'Main Google Ads MCC', availableScopes: [] }) }),
    );
  });

  it('cancels back to the Edit button without submitting', () => {
    renderForm(['act_111']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discard Me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and stays open when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save these changes. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('disables the Save button while a name is blank', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
