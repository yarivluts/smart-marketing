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

const SHOPIFY: PluginManifestView = {
  id: 'manifest-1',
  pluginId: 'com.example.shopify-pack',
  version: '1.0.0',
  type: 'source',
  displayName: 'Shopify Commerce Pack',
  scopes: ['ingest:write', 'schema:write'],
  configSchema: { shop_domain: { type: 'string', required: true }, sandbox_mode: { type: 'boolean', required: false } },
  registers: { entities: ['customer'], events: ['order_placed'], metrics: [] },
  registeredAt: '2026-01-01T00:00:00.000Z',
};

const ADS_PACK: PluginManifestView = {
  id: 'manifest-2',
  pluginId: 'com.example.ads-pack',
  version: '1.0.0',
  type: 'action',
  displayName: 'Ads Pack',
  scopes: ['action:execute'],
  configSchema: {},
  registers: { entities: [], events: [], metrics: [] },
  registeredAt: '2026-01-01T00:00:00.000Z',
};

function renderForm(manifests: readonly PluginManifestView[] = [SHOPIFY]): void {
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

  it('shows a message instead of a gallery when there is nothing to install', () => {
    renderForm([]);
    expect(screen.getByText("No plugin manifests are registered in this organization yet. Register one from the org's plugin registry first.")).toBeInTheDocument();
  });

  it('renders a card per distinct plugin id, showing display name, type, scopes and what it registers', () => {
    renderForm([SHOPIFY, ADS_PACK]);
    expect(screen.getByText('Shopify Commerce Pack')).toBeInTheDocument();
    expect(screen.getByText('com.example.shopify-pack')).toBeInTheDocument();
    expect(screen.getByText('Type: source')).toBeInTheDocument();
    expect(screen.getByText('Requests: ingest:write, schema:write')).toBeInTheDocument();
    expect(screen.getByText('Registers: 1 entities · 1 events · 0 metrics')).toBeInTheDocument();
    expect(screen.getByText('Ads Pack')).toBeInTheDocument();
  });

  it('auto-selects the first plugin and shows its scope consent + config form', () => {
    renderForm([SHOPIFY]);
    expect(screen.getByRole('option', { name: /Shopify Commerce Pack/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('This plugin requests the following scopes')).toBeInTheDocument();
    expect(screen.getByLabelText(/shop_domain/)).toBeInTheDocument();
  });

  it('switches the config form when a different plugin card is clicked', () => {
    renderForm([SHOPIFY, ADS_PACK]);
    fireEvent.click(screen.getByRole('option', { name: /Ads Pack/ }));
    expect(screen.getByRole('option', { name: /Ads Pack/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /Shopify Commerce Pack/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByLabelText(/shop_domain/)).not.toBeInTheDocument();
  });

  it('requires the consent checkbox before submitting', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/shop_domain/), { target: { value: 'my-shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Install plugin' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You must approve the requested scopes before installing.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline required-field error and does not submit when a required config field is left blank', async () => {
    renderForm();
    fireEvent.click(screen.getByLabelText("I've reviewed and approve these scopes"));
    fireEvent.click(screen.getByRole('button', { name: 'Install plugin' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This field is required.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renders a boolean config field as a real checkbox bound to a boolean, not a text input', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm();

    const sandboxCheckbox = screen.getByLabelText(/sandbox_mode/) as HTMLInputElement;
    expect(sandboxCheckbox.type).toBe('checkbox');
    expect(sandboxCheckbox.checked).toBe(false);
    fireEvent.click(sandboxCheckbox);
    expect(sandboxCheckbox.checked).toBe(true);

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
        config: { shop_domain: 'my-shop', sandbox_mode: true },
      }),
    });
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
        config: { shop_domain: 'my-shop', sandbox_mode: false },
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

  it('offers a version picker when a plugin has more than one registered version', () => {
    const olderShopify: PluginManifestView = { ...SHOPIFY, id: 'manifest-0', version: '0.9.0' };
    renderForm([olderShopify, SHOPIFY]);
    expect(screen.getByLabelText('Version')).toBeInTheDocument();
  });

  it('omits the version picker when a plugin has only one registered version', () => {
    renderForm([ADS_PACK]);
    expect(screen.queryByLabelText('Version')).not.toBeInTheDocument();
  });
});
