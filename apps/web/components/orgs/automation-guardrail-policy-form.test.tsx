import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '../../messages/en.json';
import heMessages from '../../messages/he.json';
import { AutomationGuardrailPolicyForm } from './automation-guardrail-policy-form';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const policy = {
  maxDailyBudgetChangePct: null,
  spendCeilingUsd: null,
  protectedTargetIds: [],
  allowedHoursStartHourUtc: null,
  allowedHoursEndHourUtc: null,
  maxActionsPerDay: null,
  maxGuardedMetricRegressionPct: null,
  setAt: null,
};

describe('AutomationGuardrailPolicyForm', () => {
  it('explains the technical limits in plain words', () => {
    const a = enMessages.Automation;
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AutomationGuardrailPolicyForm orgId="o1" projectId="p1" policy={policy} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText(a.policyMaxGuardedMetricRegressionPctLabel)).toHaveAccessibleDescription(
      a.policyMaxGuardedMetricRegressionPctHint,
    );
    expect(screen.getByLabelText(a.policyAllowedHoursStartLabel)).toHaveAccessibleDescription(a.policyAllowedHoursHint);
    expect(screen.getByLabelText(a.policyAllowedHoursEndLabel)).toHaveAccessibleDescription(a.policyAllowedHoursHint);
    expect(screen.getByText(a.policyProtectedTargetIdsHint)).toBeInTheDocument();
    expect(a.policyProtectedTargetIdsLabel).not.toMatch(/ids/i);
  });

  it('has Hebrew copy for every new text', () => {
    for (const key of ['policyAllowedHoursHint', 'policyMaxGuardedMetricRegressionPctHint'] as const) {
      expect(heMessages.Automation[key]).toBeTruthy();
    }
  });
});
