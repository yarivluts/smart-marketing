import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateApiKeyForm, type CreateApiKeyFormProps } from './create-api-key-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const ENVIRONMENTS = [
  { id: 'env-dev', name: 'dev' as const },
  { id: 'env-prod', name: 'prod' as const },
];

function renderForm(
  preset: Pick<CreateApiKeyFormProps, 'initialKind' | 'initialEnvironmentId' | 'initialScopes'> = {},
): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateApiKeyForm
        orgId="org-1"
        projectId="project-1"
        environments={ENVIRONMENTS}
        ingestBaseUrl="https://api.example.com/v1/ingest"
        {...preset}
      />
    </NextIntlClientProvider>,
  );
}

describe('CreateApiKeyForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the name, selected environment, and checked scopes', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        apiKeyId: 'key-1',
        keyPrefix: 'gos_live_ab',
        rawKey: 'gos_live_abcdef1234567890',
      }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI key' } });
    fireEvent.change(screen.getByLabelText('Environment'), { target: { value: 'env-prod' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'ingest.write' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'metrics.write' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/orgs/org-1/projects/project-1/keys',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'CI key',
            environmentId: 'env-prod',
            scopes: ['ingest.write', 'metrics.write'],
          }),
        }),
      ),
    );
  });

  it('shows the minted raw key exactly once, and refreshes only after it is dismissed', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        apiKeyId: 'key-1',
        keyPrefix: 'gos_live_ab',
        rawKey: 'gos_live_abcdef1234567890',
      }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI key' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'ingest.write' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(await screen.findByText('gos_live_abcdef1234567890')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText('gos_live_abcdef1234567890')).not.toBeInTheDocument();
  });

  it('mints a browser key with its allowed domains, and only then shows the website snippet', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        apiKeyId: 'key-1',
        keyPrefix: 'gos_pk_live_ab',
        rawKey: 'gos_pk_live_abcdef1234567890',
        kind: 'publishable',
      }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Website' } });
    fireEvent.click(screen.getByRole('radio', { name: /Browser key/ }));
    // A browser key has no scopes to pick: it can only send events.
    expect(screen.queryByRole('checkbox', { name: 'ingest.write' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Allowed domains (one per line)'), {
      target: { value: 'https://example.com/app' },
    });
    expect(screen.getByText(/no paths/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Allowed domains (one per line)'), {
      target: { value: 'https://www.example.com\nhttps://*.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(await screen.findByText('Website tracking snippet')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/keys',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Website',
          environmentId: 'env-dev',
          kind: 'publishable',
          allowedOrigins: ['https://www.example.com', 'https://*.example.com'],
        }),
      }),
    );
  });

  it('never shows the website snippet for a server key, whatever its scopes', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        apiKeyId: 'key-1',
        keyPrefix: 'gos_live_ab',
        rawKey: 'gos_live_abcdef1234567890',
      }),
    } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI key' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'ingest.write' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    await screen.findByText('gos_live_abcdef1234567890');
    expect(screen.queryByText('Website tracking snippet')).not.toBeInTheDocument();
  });

  it('disables submit until at least one scope is checked', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Create key' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'ingest.write' }));
    expect(screen.getByRole('button', { name: 'Create key' })).not.toBeDisabled();
  });

  it('starts on a browser key for the linked environment (from the Installation page)', () => {
    renderForm({ initialKind: 'publishable', initialEnvironmentId: 'env-prod' });
    expect(screen.getByRole('radio', { name: /Browser key/ })).toBeChecked();
    expect(screen.getByLabelText('Environment')).toHaveValue('env-prod');
    expect(screen.getByLabelText('Allowed domains (one per line)')).toBeInTheDocument();
  });

  it('starts on a server key with the linked scopes already checked', () => {
    renderForm({ initialKind: 'secret', initialScopes: ['ingest.write'] });
    expect(screen.getByRole('radio', { name: /Server key/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'ingest.write' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'metrics.write' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Create key' })).not.toBeDisabled();
  });

  it('ignores a linked environment that is not one of the project environments', () => {
    renderForm({ initialEnvironmentId: 'env-other' });
    expect(screen.getByLabelText('Environment')).toHaveValue('env-dev');
  });

  it('shows an inline error when minting fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'ingest.write' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
