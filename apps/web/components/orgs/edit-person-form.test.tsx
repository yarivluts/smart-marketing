import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditPersonForm } from './edit-person-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditPersonForm
        orgId="org-1"
        personId="person-1"
        initialName="Jordan Rep"
        initialEmail="jordan@example.com"
        initialTitle="Account Manager"
        initialPhotoUrl="https://example.com/jordan.png"
      />
    </NextIntlClientProvider>,
  );
}

describe('EditPersonForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts collapsed as an Edit button, not exposing the form fields', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('reveals the fields pre-filled with the current values when Edit is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Jordan Rep');
    expect(screen.getByLabelText('Email')).toHaveValue('jordan@example.com');
    expect(screen.getByLabelText('Title')).toHaveValue('Account Manager');
    expect(screen.getByLabelText('Photo URL')).toHaveValue('https://example.com/jordan.png');
  });

  it('submits the edited fields via PATCH, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ person: { id: 'person-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jordan Smith' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Senior Account Manager' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resources/people/person-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Jordan Smith',
          email: 'jordan@example.com',
          title: 'Senior Account Manager',
          photoUrl: 'https://example.com/jordan.png',
        }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('cancels back to the Edit button without submitting', () => {
    renderForm();
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
});
