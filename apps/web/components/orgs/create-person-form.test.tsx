import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreatePersonForm } from './create-person-form';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreatePersonForm orgId="org-1" />
    </NextIntlClientProvider>,
  );
}

describe('CreatePersonForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the name, email, title, and photo URL, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ personId: 'p1' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jordan Rep' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jordan@example.com' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Account Manager' } });
    fireEvent.change(screen.getByLabelText('Photo URL'), { target: { value: 'https://example.com/jordan.png' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resources/people',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Jordan Rep',
          email: 'jordan@example.com',
          title: 'Account Manager',
          photoUrl: 'https://example.com/jordan.png',
        }),
      }),
    );
  });

  it('omits blank email/title/photoUrl rather than sending empty strings', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ personId: 'p2' }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'No Extras' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/resources/people',
      expect.objectContaining({
        body: JSON.stringify({ name: 'No Extras', email: undefined, title: undefined, photoUrl: undefined }),
      }),
    );
  });

  it('shows an inline error when creation fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
