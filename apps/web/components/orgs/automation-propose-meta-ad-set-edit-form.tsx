'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';

export interface AutomationProposeMetaAdSetEditFormProps {
  orgId: string;
  projectId: string;
  /** Only targets with at least one Meta ad set created (a `campaign_draft_create` action already executed) — see `AutomationTargetView.metaAdSetResourceNames`. */
  targets: AutomationTargetView[];
}

/** The status select's own `""` option means "leave status untouched" — distinct from a real `enabled`/`paused` choice, mirroring `dailyBudgetUsd`'s own optional-blank-means-untouched convention for the number input. */
type StatusChoice = '' | 'enabled' | 'paused';

/** Proposes a KAN-73 follow-up `meta_ad_set_edit` action — edits the daily budget and/or status of a Meta ad set an earlier `campaign_draft_create` action already created ("post-creation ad-set edits"). */
export function AutomationProposeMetaAdSetEditForm({ orgId, projectId, targets }: AutomationProposeMetaAdSetEditFormProps): React.ReactElement | null {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [adSetResourceName, setAdSetResourceName] = useState(targets[0]?.metaAdSetResourceNames?.[0] ?? '');
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState('');
  const [statusChoice, setStatusChoice] = useState<StatusChoice>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('proposeMetaAdSetEditNoTargetsNote')}</p>;
  }

  const selectedTarget = targets.find((target) => target.id === targetId) ?? targets[0];
  const adSetOptions = selectedTarget.metaAdSetResourceNames ?? [];

  function handleTargetChange(nextTargetId: string): void {
    setTargetId(nextTargetId);
    const nextTarget = targets.find((target) => target.id === nextTargetId);
    setAdSetResourceName(nextTarget?.metaAdSetResourceNames?.[0] ?? '');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const trimmedBudget = dailyBudgetUsd.trim();
    const parsedBudget = trimmedBudget.length > 0 ? Number(trimmedBudget) : undefined;
    if (parsedBudget === undefined && statusChoice === '') {
      setError(t('proposeMetaAdSetEditEmptyError'));
      return;
    }
    if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) {
      setError(t('proposeMetaAdSetEditInvalidBudgetError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/meta-ad-set-edits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId,
          adSetResourceName,
          ...(parsedBudget !== undefined ? { dailyBudgetUsd: parsedBudget } : {}),
          ...(statusChoice !== '' ? { status: statusChoice } : {}),
        }),
      });
      if (!response.ok) {
        setError(t('proposeMetaAdSetEditError'));
        return;
      }
      setDailyBudgetUsd('');
      setStatusChoice('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-set-edit-target">
            {t('proposeMetaAdSetEditTargetLabel')}
          </label>
          <select
            id="meta-ad-set-edit-target"
            value={selectedTarget.id}
            onChange={(event) => handleTargetChange(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-set-edit-ad-set">
            {t('proposeMetaAdSetEditAdSetLabel')}
          </label>
          <select
            id="meta-ad-set-edit-ad-set"
            value={adSetResourceName}
            onChange={(event) => setAdSetResourceName(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {adSetOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-set-edit-budget">
            {t('proposeMetaAdSetEditBudgetLabel')}
          </label>
          <input
            id="meta-ad-set-edit-budget"
            type="number"
            min="0"
            step="0.01"
            value={dailyBudgetUsd}
            onChange={(event) => setDailyBudgetUsd(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            placeholder={t('proposeMetaAdSetEditBudgetPlaceholder')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-set-edit-status">
            {t('proposeMetaAdSetEditStatusLabel')}
          </label>
          <select
            id="meta-ad-set-edit-status"
            value={statusChoice}
            onChange={(event) => setStatusChoice(event.target.value as StatusChoice)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">{t('proposeMetaAdSetEditStatusUnchanged')}</option>
            <option value="enabled">{t('campaignStatusEnabled')}</option>
            <option value="paused">{t('campaignStatusPaused')}</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {t('proposeMetaAdSetEditButton')}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
