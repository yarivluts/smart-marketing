'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { labelsToLines, parseLabelsInput } from '@/lib/orgs/cost-guardrail-view';

export interface SetCostQuotaFormProps {
  orgId: string;
  projectId: string;
  dailyQueryLimit: number;
  labels: Record<string, string>;
}

/** Sets a project's KAN-39 daily metric-query quota + labels. */
export function SetCostQuotaForm({ orgId, projectId, dailyQueryLimit, labels }: SetCostQuotaFormProps): React.ReactElement {
  const t = useTranslations('CostGuardrails');
  const router = useRouter();
  const [limitInput, setLimitInput] = useState(String(dailyQueryLimit));
  const [labelsInput, setLabelsInput] = useState(labelsToLines(labels));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsedLimit = Number(limitInput);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      setError(t('invalidLimitError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/cost-guardrails/quota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyQueryLimit: parsedLimit, labels: parseLabelsInput(labelsInput) }),
      });
      if (!response.ok) {
        setError(t('setQuotaError'));
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="cost-quota-daily-limit">
          {t('dailyLimitLabel')}
        </label>
        <Input
          id="cost-quota-daily-limit"
          type="number"
          min={1}
          step={1}
          required
          value={limitInput}
          onChange={(event) => setLimitInput(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="cost-quota-labels">
          {t('labelsLabel')}
        </label>
        <textarea
          id="cost-quota-labels"
          className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
          placeholder={t('labelsPlaceholder')}
          value={labelsInput}
          onChange={(event) => setLabelsInput(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('labelsHint')}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting}>
        {t('setQuotaButton')}
      </Button>
    </form>
  );
}
