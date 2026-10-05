import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EditAllowedOriginsForm } from './edit-allowed-origins-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh }) }));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditAllowedOriginsForm
        orgId="org-1"
        projectId="project-1"
        apiKeyId="key-1"
        initialOrigins={['https://www.example.com']}
      />
    </NextIntlClientProvider>,
  );
}

describe('EditAllowedOriginsForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it("shows the key's domains and saves an edited list", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm();
    expect(screen.getByText('https://www.example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit domains' }));
    fireEvent.change(screen.getByLabelText('Allowed domains (one per line)'), {
      target: { value: 'https://www.example.com\nhttps://staging.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save domains' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/keys/key-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          allowedOrigins: ['https://www.example.com', 'https://staging.example.com'],
        }),
      }),
    );
  });

  it('will not save an invalid or empty list, and says why a save failed', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Edit domains' }));
    fireEvent.change(screen.getByLabelText('Allowed domains (one per line)'), {
      target: { value: '' },
    });
    expect(screen.getByRole('button', { name: 'Save domains' })).toBeDisabled();
    expect(screen.getByText('Add at least one domain.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Allowed domains (one per line)'), {
      target: { value: 'https://a.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save domains' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the domains");
  });
});
