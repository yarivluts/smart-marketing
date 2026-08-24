import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { GoalTargetInput } from './goal-target-input';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderMaximize(targetValue: number | null): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GoalTargetInput
        orgId="org-1"
        projectId="project-1"
        goalId="goal-1"
        goalName="Q3 signups"
        direction="maximize"
        targetValue={targetValue}
        rangeMin={null}
        rangeMax={null}
      />
    </NextIntlClientProvider>,
  );
}

function renderRange(rangeMin: number | null, rangeMax: number | null): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GoalTargetInput
        orgId="org-1"
        projectId="project-1"
        goalId="goal-1"
        goalName="Healthy CAC band"
        direction="range"
        targetValue={null}
        rangeMin={rangeMin}
        rangeMax={rangeMax}
      />
    </NextIntlClientProvider>,
  );
}

describe('GoalTargetInput — maximize/minimize (single target value)', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the current target value', () => {
    renderMaximize(1000);
    expect(screen.getByLabelText('Target value for Q3 signups')).toHaveValue(1000);
  });

  it('PATCHes the new target value on blur, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderMaximize(1000);

    fireEvent.change(screen.getByLabelText('Target value for Q3 signups'), { target: { value: '1500' } });
    fireEvent.blur(screen.getByLabelText('Target value for Q3 signups'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/goals/goal-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ targetValue: 1500 }) }),
    );
  });

  it('shows an inline error, never calls fetch, and reverts the displayed value when cleared to empty', async () => {
    renderMaximize(1000);

    fireEvent.change(screen.getByLabelText('Target value for Q3 signups'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Target value for Q3 signups'));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update the target. Please try again.");
    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Target value for Q3 signups')).toHaveValue(1000);
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderMaximize(1000);

    fireEvent.change(screen.getByLabelText('Target value for Q3 signups'), { target: { value: '2000' } });
    fireEvent.blur(screen.getByLabelText('Target value for Q3 signups'));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update the target. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Target value for Q3 signups')).toHaveValue(1000);
  });

  it('shows an inline error and reverts, rather than throwing unhandled, when fetch itself rejects (network failure)', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    renderMaximize(1000);

    fireEvent.change(screen.getByLabelText('Target value for Q3 signups'), { target: { value: '2000' } });
    fireEvent.blur(screen.getByLabelText('Target value for Q3 signups'));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update the target. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Target value for Q3 signups')).toHaveValue(1000);
  });
});

describe('GoalTargetInput — range (rangeMin/rangeMax)', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the current range', () => {
    renderRange(20, 40);
    expect(screen.getByLabelText('Range minimum for Healthy CAC band')).toHaveValue(20);
    expect(screen.getByLabelText('Range maximum for Healthy CAC band')).toHaveValue(40);
  });

  it('PATCHes both bounds on blur, then refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderRange(20, 40);

    fireEvent.change(screen.getByLabelText('Range minimum for Healthy CAC band'), { target: { value: '25' } });
    fireEvent.blur(screen.getByLabelText('Range minimum for Healthy CAC band'));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/goals/goal-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ rangeMin: 25, rangeMax: 40 }) }),
    );
  });

  it('shows an inline error and reverts both fields when rangeMin >= rangeMax', async () => {
    renderRange(20, 40);

    fireEvent.change(screen.getByLabelText('Range minimum for Healthy CAC band'), { target: { value: '50' } });
    fireEvent.blur(screen.getByLabelText('Range minimum for Healthy CAC band'));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update the target. Please try again.");
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Range minimum for Healthy CAC band')).toHaveValue(20);
    expect(screen.getByLabelText('Range maximum for Healthy CAC band')).toHaveValue(40);
  });

  it('does not commit (or spuriously reject) when tabbing from min straight into max — only the blur that leaves the pair commits', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    renderRange(20, 40);

    const minInput = screen.getByLabelText('Range minimum for Healthy CAC band');
    const maxInput = screen.getByLabelText('Range maximum for Healthy CAC band');

    // Moving the whole band up (20-40 -> 45-50): typing 45 into min then tabbing to max must not
    // validate 45 against max's still-stale 40 and revert it before max is even edited.
    fireEvent.change(minInput, { target: { value: '45' } });
    fireEvent.blur(minInput, { relatedTarget: maxInput });
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(minInput).toHaveValue(45);

    fireEvent.change(maxInput, { target: { value: '50' } });
    fireEvent.blur(maxInput);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/orgs/org-1/projects/project-1/goals/goal-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ rangeMin: 45, rangeMax: 50 }) }),
    );
  });
});
