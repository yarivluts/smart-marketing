import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { InstallPluginForm } from './install-plugin-form';
import type { PluginManifestView } from '@/lib/orgs/plugin-view';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const MANIFEST: PluginManifestView = {
  id: 'manifest-1',
  pluginId: 'com.example.shopify-pack',
  version: '1.0.0',
  type: 'source',
  displayName: 'Shopify Commerce Pack',
  scopes: ['ingest:write', 'schema:write'],
  configSchema: { shop_domain: { type: 'string', required: true } },
  registers: { entities: [], events: [], metrics: [] },
  registeredAt: '2026-01-01T00:00:00.000Z',
};

function renderForm(manifests: readonly PluginManifestView[] = [MANIFEST]): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InstallPluginForm orgId="org-1" projectId="project-1" manifests={manifests} />
    </NextIntlClientProvider>,
  );
}

describe('InstallPluginForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows a message instead of a form when there is nothing to install', () => {
    renderForm([]);
    expect(screen.getByText("No plugin manifests are registered in this organization yet. Register one from the org's plugin registry first.")).toBeInTheDocument();
  });

  it('requires the consent checkbox before submitting', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/shop_domain/), { target: { value: 'my-shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Install plugin' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You must approve the requested scopes before installing.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('submits the full manifest scope list and config once consented', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.click(screen.getByLabelText("I've reviewed and approve these scopes"));
    fireEvent.change(screen.getByLabelText(/shop_domain/), { target: { value: 'my-shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Install plugin' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/plugins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pluginId: 'com.example.shopify-pack',
        version: '1.0.0',
        consentedScopes: ['ingest:write', 'schema:write'],
        config: { shop_domain: 'my-shop' },
      }),
    });
  });

  it('shows the specific already-installed error when the server reports one', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'already_installed' }) } as Response);
    renderForm();

    fireEvent.click(screen.getByLabelText("I've reviewed and approve these scopes"));
    fireEvent.change(screen.getByLabelText(/shop_domain/), { target: { value: 'my-shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Install plugin' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This plugin is already installed in this project. Uninstall it first to install a different version.',
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
