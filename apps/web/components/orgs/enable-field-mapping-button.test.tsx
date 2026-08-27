import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EnableFieldMappingButton } from './enable-field-mapping-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EnableFieldMappingButton orgId="org-1" projectId="project-1" fieldMappingId="mapping-1" />
    </NextIntlClientProvider>,
  );
}

describe('EnableFieldMappingButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs to the enable route and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'enabled' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/field-mappings/mapping-1/enable', { method: 'POST' });
  });

  it('shows an inline error when enabling fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't enable this mapping. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
