import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DeleteGoalButton } from './delete-goal-button';
import messages from '../../messages/en.json';

const push = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DeleteGoalButton orgId="org-1" projectId="project-1" goalId="goal-1" />
    </NextIntlClientProvider>,
  );
}

describe('DeleteGoalButton', () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('confirm', vi.fn());
  });

  it('does nothing when the confirm dialog is dismissed', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Delete goal' }));

    expect(fetch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('deletes the goal and navigates back to the goals list when confirmed', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Delete goal' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/orgs/org-1/projects/project-1/goals'));
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/goals/goal-1', { method: 'DELETE' });
  });

  it('shows an inline error and does not navigate when the request fails', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Delete goal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the goal. Please try again.');
    expect(push).not.toHaveBeenCalled();
  });
});
