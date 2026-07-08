import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RegisterPluginManifestForm } from './register-plugin-manifest-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RegisterPluginManifestForm orgId="org-1" />
    </NextIntlClientProvider>,
  );
}

describe('RegisterPluginManifestForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the manifest YAML and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('plugin.yaml'), { target: { value: 'id: com.example.foo\nversion: 1.0.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register manifest' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/plugins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifestYaml: 'id: com.example.foo\nversion: 1.0.0' }),
    });
  });

  it('shows the specific duplicate error when the server reports one', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'duplicate_manifest' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('plugin.yaml'), { target: { value: 'id: com.example.foo\nversion: 1.0.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register manifest' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This plugin id and version is already registered. Publish a new version instead.',
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows validation reasons returned by the server', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'invalid_manifest', reasons: ['`id` is required and must be a non-empty string.'] }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('plugin.yaml'), { target: { value: 'not a manifest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register manifest' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('`id` is required and must be a non-empty string.');
  });
});
