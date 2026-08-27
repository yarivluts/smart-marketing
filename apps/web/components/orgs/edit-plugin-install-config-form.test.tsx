import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditPluginInstallConfigForm } from './edit-plugin-install-config-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const CONFIG_SCHEMA = {
  shop_domain: { type: 'string' as const, required: true },
  sandbox_mode: { type: 'boolean' as const, required: false },
};

function renderForm(overrides: { configSchema?: typeof CONFIG_SCHEMA; initialConfig?: Record<string, unknown> } = {}): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditPluginInstallConfigForm
        orgId="org-1"
        projectId="project-1"
        installId="install-1"
        configSchema={overrides.configSchema ?? CONFIG_SCHEMA}
        initialConfig={overrides.initialConfig ?? { shop_domain: 'old-shop.myshopify.com', sandbox_mode: true }}
      />
    </NextIntlClientProvider>,
  );
}

describe('EditPluginInstallConfigForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders nothing when the install’s pinned manifest version has no config fields', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <EditPluginInstallConfigForm orgId="org-1" projectId="project-1" installId="install-1" configSchema={{}} initialConfig={{}} />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('starts collapsed as an "Edit config" button, not exposing the form fields', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Edit config' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/shop_domain/)).not.toBeInTheDocument();
  });

  it('reveals the fields pre-filled from the install’s own config', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit config' }));

    expect(screen.getByLabelText(/shop_domain/)).toHaveValue('old-shop.myshopify.com');
    expect(screen.getByLabelText(/sandbox_mode/)).toBeChecked();
  });

  it('submits the edited config via PATCH, then collapses back and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ install: { id: 'install-1' } }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit config' }));
    fireEvent.change(screen.getByLabelText(/shop_domain/), { target: { value: 'new-shop.myshopify.com' } });
    fireEvent.click(screen.getByLabelText(/sandbox_mode/));
    fireEvent.click(screen.getByRole('button', { name: 'Save config' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/plugins/install-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ config: { shop_domain: 'new-shop.myshopify.com', sandbox_mode: false } }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Edit config' })).toBeInTheDocument();
  });

  it('shows an inline required-field error and does not submit when a required field is cleared', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit config' }));
    fireEvent.change(screen.getByLabelText(/shop_domain/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save config' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This field is required.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the server’s reasons when the config is rejected server-side', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_config', reasons: ['Config field "shop_domain" must be of type "string".'] }) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit config' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save config' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Config field "shop_domain" must be of type "string".');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a generic inline error and stays open when saving fails without reasons', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Edit config' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save config' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the config. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/shop_domain/)).toBeInTheDocument();
  });

  it('cancels back to the "Edit config" button without submitting, discarding edits', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit config' }));
    fireEvent.change(screen.getByLabelText(/shop_domain/), { target: { value: 'discard-me.myshopify.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit config' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit config' }));
    expect(screen.getByLabelText(/shop_domain/)).toHaveValue('old-shop.myshopify.com');
  });
});
