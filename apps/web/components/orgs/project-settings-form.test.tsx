import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ProjectSettingsForm } from './project-settings-form';
import messages from '../../messages/en.json';
import heMessages from '../../messages/he.json';

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
    expect(screen.getByLabelText('Business type')).toHaveValue('ecommerce');
  });

  it('suggests plain business types in both languages', () => {
    renderForm();
    const input = screen.getByLabelText('Business type');
    const list = document.getElementById(input.getAttribute('list') ?? '');
    const values = Array.from(list?.querySelectorAll('option') ?? []).map((o) => o.getAttribute('value'));
    expect(values).toContain('Online shop');
    expect(values).toContain('Law firm');
    const he = JSON.parse(JSON.stringify(heMessages.ProjectSettings)) as Record<string, string>;
    const en = messages.ProjectSettings as Record<string, string>;
    for (const key of Object.keys(en).filter((k) => k.startsWith('verticalOption_'))) {
      expect(he[key]).toBeTruthy();
      expect(he[key]).not.toBe(en[key]);
    }
  });

  it('offers one click to use the device time zone instead of typing it', async () => {
    const resolved = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ timeZone: 'Asia/Jerusalem' } as Intl.ResolvedDateTimeFormatOptions);
    renderForm();

    const button = await screen.findByRole('button', { name: "Use this device's time zone (Asia/Jerusalem)" });
    fireEvent.click(button);
    expect(screen.getByLabelText('Time zone')).toHaveValue('Asia/Jerusalem');
    expect(screen.queryByRole('button', { name: /Use this device/ })).toBeNull();
    resolved.mockRestore();
  });

  it('suggests currency codes and time zones so nobody has to type them from memory', async () => {
    const supported = vi.spyOn(Intl as unknown as { supportedValuesOf: (key: string) => string[] }, 'supportedValuesOf');
    supported.mockImplementation((key: string) => (key === 'currency' ? ['ILS', 'USD'] : ['Asia/Jerusalem']));
    renderForm();

    await waitFor(() => expect(document.querySelectorAll('#project-settings-currency-options option')).toHaveLength(2));
    expect(screen.getByLabelText('Currency')).toHaveAttribute('list', 'project-settings-currency-options');
    expect(screen.getByLabelText('Time zone')).toHaveAttribute('list', 'project-settings-timezone-options');
    expect(document.querySelector('#project-settings-timezone-options option')).toHaveAttribute('value', 'Asia/Jerusalem');
    supported.mockRestore();
  });

  it('names each suggested currency so nobody has to know what ILS or USD means', async () => {
    const supported = vi.spyOn(Intl as unknown as { supportedValuesOf: (key: string) => string[] }, 'supportedValuesOf');
    supported.mockImplementation((key: string) => (key === 'currency' ? ['ILS', 'USD'] : []));
    renderForm();

    await waitFor(() => expect(document.querySelectorAll('#project-settings-currency-options option')).toHaveLength(2));
    const labels = Array.from(document.querySelectorAll('#project-settings-currency-options option')).map((o) => o.getAttribute('label'));
    expect(labels[0]).toMatch(/shekel/i);
    expect(labels[1]).toMatch(/dollar/i);
    supported.mockRestore();
  });

  it('submits the edited fields and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Storefront' } });
    fireEvent.change(screen.getByLabelText('Business type'), { target: { value: 'fintech' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Storefront', vertical: 'fintech', currency: '', timezone: '' }),
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

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not save these settings, and nothing was changed. Check your internet connection and try again.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the same message when the request never reaches the server (offline)', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nothing was changed');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
