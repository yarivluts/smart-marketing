'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AutomationSeedTargetFormProps {
  orgId: string;
  projectId: string;
}

/**
 * Seeds a new simulated automation target — the buildable-today stand-in for
 * "connect a real ad account and pick a campaign" until KAN-72/73 exist (see
 * `AutomationTargetStateModel`'s own doc comment).
 */
export function AutomationSeedTargetForm({ orgId, projectId }: AutomationSeedTargetFormProps): React.ReactElement {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [targetId, setTargetId] = useState('');
  const [label, setLabel] = useState('');
  const [environmentId, setEnvironmentId] = useState('live');
  const [initialDailyBudgetUsd, setInitialDailyBudgetUsd] = useState('100');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsedBudget = Number(initialDailyBudgetUsd);
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
      setError(t('seedTargetInvalidBudgetError'));
      return;
    }
    if (targetId.trim().length === 0 || label.trim().length === 0 || environmentId.trim().length === 0) {
      setError(t('seedTargetFieldsRequiredError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: targetId.trim(),
          environmentId: environmentId.trim(),
          targetType: 'campaign',
          label: label.trim(),
          initialDailyBudgetUsd: parsedBudget,
        }),
      });
      if (!response.ok) {
        setError(t('seedTargetError'));
        return;
      }
      setTargetId('');
      setLabel('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="seed-target-id">
          {t('seedTargetIdLabel')}
        </label>
        <Input id="seed-target-id" value={targetId} onChange={(event) => setTargetId(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="seed-target-label">
          {t('seedTargetLabelLabel')}
        </label>
        <Input id="seed-target-label" value={label} onChange={(event) => setLabel(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="seed-target-environment">
          {t('seedTargetEnvironmentLabel')}
        </label>
        <Input id="seed-target-environment" value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="seed-target-budget">
          {t('seedTargetBudgetLabel')}
        </label>
        <Input
          id="seed-target-budget"
          type="number"
          min={0}
          value={initialDailyBudgetUsd}
          onChange={(event) => setInitialDailyBudgetUsd(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {t('seedTargetButton')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
