import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreateBoardForm } from './create-board-form';
import messages from '../../messages/en.json';

const push = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreateBoardForm orgId="org-1" projectId="project-1" />
    </NextIntlClientProvider>,
  );
}

describe('CreateBoardForm', () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('creates a board and navigates to it', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ board: { id: 'board-1' } }) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Marketing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orgs/org-1/projects/project-1/boards/board-1'));
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Marketing' }),
    });
  });

  it('disables the submit button while the name is empty', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Create board' })).toBeDisabled();
  });

  it('shows an inline error and does not navigate when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Marketing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the board. Please try again.');
    expect(push).not.toHaveBeenCalled();
  });
});
