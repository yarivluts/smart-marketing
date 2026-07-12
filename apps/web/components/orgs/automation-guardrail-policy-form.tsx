'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AutomationGuardrailPolicyView } from '@/lib/orgs/automation-view';

export interface AutomationGuardrailPolicyFormProps {
  orgId: string;
  projectId: string;
  policy: AutomationGuardrailPolicyView;
}

function toInputValue(value: number | null): string {
  return value === null ? '' : String(value);
}

function parseOptionalNumber(value: string): number | null | undefined {
  if (value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Sets a project's KAN-71 automation guardrail policy — every field is optional (blank = that guardrail type is off). */
export function AutomationGuardrailPolicyForm({ orgId, projectId, policy }: AutomationGuardrailPolicyFormProps): React.ReactElement {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [maxDailyBudgetChangePct, setMaxDailyBudgetChangePct] = useState(toInputValue(policy.maxDailyBudgetChangePct));
  const [spendCeilingUsd, setSpendCeilingUsd] = useState(toInputValue(policy.spendCeilingUsd));
  const [protectedTargetIds, setProtectedTargetIds] = useState(policy.protectedTargetIds.join('\n'));
  const [allowedHoursStartHourUtc, setAllowedHoursStartHourUtc] = useState(toInputValue(policy.allowedHoursStartHourUtc));
  const [allowedHoursEndHourUtc, setAllowedHoursEndHourUtc] = useState(toInputValue(policy.allowedHoursEndHourUtc));
  const [maxActionsPerDay, setMaxActionsPerDay] = useState(toInputValue(policy.maxActionsPerDay));
  const [maxGuardedMetricRegressionPct, setMaxGuardedMetricRegressionPct] = useState(toInputValue(policy.maxGuardedMetricRegressionPct));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsedMaxDailyBudgetChangePct = parseOptionalNumber(maxDailyBudgetChangePct);
    const parsedSpendCeilingUsd = parseOptionalNumber(spendCeilingUsd);
    const parsedAllowedHoursStartHourUtc = parseOptionalNumber(allowedHoursStartHourUtc);
    const parsedAllowedHoursEndHourUtc = parseOptionalNumber(allowedHoursEndHourUtc);
    const parsedMaxActionsPerDay = parseOptionalNumber(maxActionsPerDay);
    const parsedMaxGuardedMetricRegressionPct = parseOptionalNumber(maxGuardedMetricRegressionPct);
    if (
      parsedMaxDailyBudgetChangePct === undefined ||
      parsedSpendCeilingUsd === undefined ||
      parsedAllowedHoursStartHourUtc === undefined ||
      parsedAllowedHoursEndHourUtc === undefined ||
      parsedMaxActionsPerDay === undefined ||
      parsedMaxGuardedMetricRegressionPct === undefined
    ) {
      setError(t('policyInvalidNumberError'));
      return;
    }
    if ((parsedAllowedHoursStartHourUtc === null) !== (parsedAllowedHoursEndHourUtc === null)) {
      setError(t('policyAllowedHoursBothOrNeitherError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/guardrail-policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxDailyBudgetChangePct: parsedMaxDailyBudgetChangePct,
          spendCeilingUsd: parsedSpendCeilingUsd,
          protectedTargetIds: protectedTargetIds
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
          allowedHoursStartHourUtc: parsedAllowedHoursStartHourUtc,
          allowedHoursEndHourUtc: parsedAllowedHoursEndHourUtc,
          maxActionsPerDay: parsedMaxActionsPerDay,
          maxGuardedMetricRegressionPct: parsedMaxGuardedMetricRegressionPct,
        }),
      });
      if (!response.ok) {
        setError(t('policySetError'));
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="policy-max-daily-change-pct">
            {t('policyMaxDailyChangePctLabel')}
          </label>
          <Input
            id="policy-max-daily-change-pct"
            type="number"
            min={0}
            value={maxDailyBudgetChangePct}
            onChange={(event) => setMaxDailyBudgetChangePct(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="policy-spend-ceiling">
            {t('policySpendCeilingLabel')}
          </label>
          <Input id="policy-spend-ceiling" type="number" min={0} value={spendCeilingUsd} onChange={(event) => setSpendCeilingUsd(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="policy-allowed-hours-start">
            {t('policyAllowedHoursStartLabel')}
          </label>
          <Input
            id="policy-allowed-hours-start"
            type="number"
            min={0}
            max={23}
            value={allowedHoursStartHourUtc}
            onChange={(event) => setAllowedHoursStartHourUtc(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="policy-allowed-hours-end">
            {t('policyAllowedHoursEndLabel')}
          </label>
          <Input
            id="policy-allowed-hours-end"
            type="number"
            min={0}
            max={23}
            value={allowedHoursEndHourUtc}
            onChange={(event) => setAllowedHoursEndHourUtc(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="policy-max-actions-per-day">
            {t('policyMaxActionsPerDayLabel')}
          </label>
          <Input
            id="policy-max-actions-per-day"
            type="number"
            min={0}
            value={maxActionsPerDay}
            onChange={(event) => setMaxActionsPerDay(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="policy-max-guarded-metric-regression-pct">
            {t('policyMaxGuardedMetricRegressionPctLabel')}
          </label>
          <Input
            id="policy-max-guarded-metric-regression-pct"
            type="number"
            min={0}
            value={maxGuardedMetricRegressionPct}
            onChange={(event) => setMaxGuardedMetricRegressionPct(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="policy-protected-target-ids">
          {t('policyProtectedTargetIdsLabel')}
        </label>
        <textarea
          id="policy-protected-target-ids"
          className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
          value={protectedTargetIds}
          onChange={(event) => setProtectedTargetIds(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('policyProtectedTargetIdsHint')}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting}>
        {t('policySaveButton')}
      </Button>
    </form>
  );
}
