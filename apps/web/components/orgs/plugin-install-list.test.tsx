import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PluginInstallList } from './plugin-install-list';
import type { PluginInstallView, PluginManifestView } from '@/lib/orgs/plugin-view';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function install(overrides: Partial<PluginInstallView> = {}): PluginInstallView {
  return {
    id: 'install-1',
    pluginId: 'com.example.shopify-pack',
    version: '1.0.0',
    status: 'installed',
    grantedScopes: ['ingest:write'],
    config: {},
    installedAt: '2026-01-01T00:00:00.000Z',
    disabledAt: null,
    enabledAt: null,
    uninstalledAt: null,
    sinkExternalRef: null,
    ...overrides,
  };
}

function manifestWithConfig(overrides: Partial<PluginManifestView> = {}): PluginManifestView {
  return {
    id: 'manifest-1',
    pluginId: 'com.example.shopify-pack',
    version: '1.0.0',
    type: 'source',
    displayName: 'Shopify Commerce Pack',
    scopes: ['ingest:write'],
    configSchema: { shop_domain: { type: 'string', required: true } },
    registers: { entities: [], events: [], metrics: [] },
    registeredAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderList(installs: readonly PluginInstallView[], manifests: readonly PluginManifestView[] = []): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PluginInstallList orgId="org-1" projectId="project-1" installs={installs} manifests={manifests} />
    </NextIntlClientProvider>,
  );
}

describe('PluginInstallList', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows a message when there are no installs', () => {
    renderList([]);
    expect(screen.getByText('No plugins have been installed in this project yet.')).toBeInTheDocument();
  });

  it('offers disable + uninstall for an installed plugin, and calls the disable endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderList([install({ status: 'installed' })]);

    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uninstall' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/plugins/install-1/disable', { method: 'POST' });
  });

  it('offers enable + uninstall for a disabled plugin, and calls the enable endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderList([install({ status: 'disabled', disabledAt: '2026-01-02T00:00:00.000Z' })]);

    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uninstall' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/plugins/install-1/enable', { method: 'POST' });
  });

  it('offers no actions for an uninstalled plugin', () => {
    renderList([install({ status: 'uninstalled', uninstalledAt: '2026-01-03T00:00:00.000Z' })], [manifestWithConfig()]);
    expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Uninstall' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit config' })).not.toBeInTheDocument();
  });

  it('offers an "Edit config" control for an installed plugin whose manifest declares config fields', () => {
    renderList([install({ status: 'installed', config: { shop_domain: 'x.myshopify.com' } })], [manifestWithConfig()]);
    expect(screen.getByRole('button', { name: 'Edit config' })).toBeInTheDocument();
  });

  it('offers no "Edit config" control when the pinned manifest version declares no config fields', () => {
    renderList([install({ status: 'installed' })], [manifestWithConfig({ configSchema: {} })]);
    expect(screen.queryByRole('button', { name: 'Edit config' })).not.toBeInTheDocument();
  });

  it('shows an inline error and does not refresh when the action request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderList([install({ status: 'installed' })]);

    fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't complete that action. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
