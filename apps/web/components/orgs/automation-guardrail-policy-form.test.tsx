import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AutomationGuardrailPolicyForm } from './automation-guardrail-policy-form';
import type { AutomationGuardrailPolicyView } from '@/lib/orgs/automation-view';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const PERMISSIVE_POLICY: AutomationGuardrailPolicyView = {
  maxDailyBudgetChangePct: null,
  spendCeilingUsd: null,
  protectedTargetIds: [],
  allowedHoursStartHourUtc: null,
  allowedHoursEndHourUtc: null,
  maxActionsPerDay: null,
  maxGuardedMetricRegressionPct: null,
  setAt: null,
};

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AutomationGuardrailPolicyForm orgId="org-1" projectId="project-1" policy={PERMISSIVE_POLICY} />
    </NextIntlClientProvider>,
  );
}

describe('AutomationGuardrailPolicyForm', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits the parsed policy and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    renderForm();

    fireEvent.change(screen.getByLabelText('Max daily budget change (%)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Allowed hours start (UTC)'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Allowed hours end (UTC)'), { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/automation/guardrail-policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maxDailyBudgetChangePct: 25,
        spendCeilingUsd: null,
        protectedTargetIds: [],
        allowedHoursStartHourUtc: 9,
        allowedHoursEndHourUtc: 17,
        maxActionsPerDay: null,
        maxGuardedMetricRegressionPct: null,
      }),
    });
  });

  it('rejects an allowed-hours window with only one bound set, client-side, without calling fetch', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Allowed hours start (UTC)'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Set both allowed-hours fields, or leave both blank.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects equal allowed-hours start/end, client-side, without calling fetch', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Allowed hours start (UTC)'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Allowed hours end (UTC)'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Allowed-hours start and end must not be equal (that would block automation every hour). Leave both blank to allow all hours.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not refresh when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the guardrail policy. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
