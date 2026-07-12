'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';

export interface AutomationProposeActionFormProps {
  orgId: string;
  projectId: string;
  targets: AutomationTargetView[];
}

/** Proposes a simulated budget-change action against one of the project's seeded targets (KAN-71's dry-run-diff step). */
export function AutomationProposeActionForm({ orgId, projectId, targets }: AutomationProposeActionFormProps): React.ReactElement | null {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [afterDailyBudgetUsd, setAfterDailyBudgetUsd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('proposeNoTargetsNote')}</p>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsedBudget = Number(afterDailyBudgetUsd);
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
      setError(t('proposeInvalidBudgetError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, afterDailyBudgetUsd: parsedBudget }),
      });
      if (!response.ok) {
        setError(t('proposeError'));
        return;
      }
      setAfterDailyBudgetUsd('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="propose-target">
          {t('proposeTargetLabel')}
        </label>
        <select
          id="propose-target"
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {t('proposeTargetOptionLabel', { label: target.label, budget: target.dailyBudgetUsd })}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="propose-after-budget">
          {t('proposeAfterBudgetLabel')}
        </label>
        <Input
          id="propose-after-budget"
          type="number"
          min={0}
          value={afterDailyBudgetUsd}
          onChange={(event) => setAfterDailyBudgetUsd(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {t('proposeButton')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
