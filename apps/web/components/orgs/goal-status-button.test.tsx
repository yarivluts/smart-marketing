import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { GoalStatusButton } from './goal-status-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderButton(status: 'active' | 'paused'): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GoalStatusButton orgId="org-1" projectId="project-1" goalId="goal-1" status={status} />
    </NextIntlClientProvider>,
  );
}

describe('GoalStatusButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('offers "Pause goal" for an active goal and POSTs status=paused', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderButton('active');

    fireEvent.click(screen.getByRole('button', { name: 'Pause goal' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/goals/goal-1/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    });
  });

  it('offers "Resume goal" for a paused goal and POSTs status=active', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderButton('paused');

    fireEvent.click(screen.getByRole('button', { name: 'Resume goal' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ body: JSON.stringify({ status: 'active' }) });
  });

  it('shows an inline error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton('active');

    fireEvent.click(screen.getByRole('button', { name: 'Pause goal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Could not update the goal's status. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
