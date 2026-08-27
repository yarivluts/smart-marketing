import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditApiKeyNameForm } from './edit-api-key-name-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditApiKeyNameForm orgId="org-1" projectId="project-1" apiKeyId="key-1" initialName="Original name" />
    </NextIntlClientProvider>,
  );
}

describe('EditApiKeyNameForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('starts collapsed, showing only a Rename button pre-filled from the initial name once opened', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Original name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(screen.getByDisplayValue('Original name')).toBeInTheDocument();
  });

  it('PATCHes the new name and collapses back on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ apiKeyId: 'key-1', name: 'Renamed key' }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByDisplayValue('Original name'), { target: { value: 'Renamed key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/keys/key-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed key' }),
    });
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });

  it('shows an inline error and stays open when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't rename this key. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Original name')).toBeInTheDocument();
  });

  it('discards edits on cancel', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByDisplayValue('Original name'), { target: { value: 'Some draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByDisplayValue('Original name')).toBeInTheDocument();
  });
});
