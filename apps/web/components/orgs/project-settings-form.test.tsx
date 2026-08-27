import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProjectSettingsForm } from './project-settings-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProjectSettingsForm orgId="org-1" projectId="project-1" initialName="Website" initialVertical="ecommerce" />
    </NextIntlClientProvider>,
  );
}

describe('ProjectSettingsForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('prefills the current name/vertical', () => {
    renderForm();
    expect(screen.getByLabelText('Project name')).toHaveValue('Website');
    expect(screen.getByLabelText('Vertical')).toHaveValue('ecommerce');
  });

  it('submits the edited fields and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Storefront' } });
    fireEvent.change(screen.getByLabelText('Vertical'), { target: { value: 'fintech' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Storefront', vertical: 'fintech' }),
    });
  });

  it('rejects a blank name client-side without calling fetch', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Project name is required.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save these settings. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
