import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DisableFieldMappingButton } from './disable-field-mapping-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DisableFieldMappingButton orgId="org-1" projectId="project-1" fieldMappingId="mapping-1" />
    </NextIntlClientProvider>,
  );
}

describe('DisableFieldMappingButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('DELETEs the mapping and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'disabled' }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/field-mappings/mapping-1', { method: 'DELETE' });
  });

  it('shows an inline error when disabling fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't disable this mapping. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
