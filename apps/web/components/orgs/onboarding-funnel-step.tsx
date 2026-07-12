'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FUNNEL_STAGE_KEYS, type FunnelStageKey } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface OnboardingFunnelStepRow {
  eventSchemaName: string;
  stageKey: FunnelStageKey;
  included: boolean;
}

export interface OnboardingFunnelStepProps {
  orgId: string;
  projectId: string;
  proposal: readonly { eventSchemaName: string; stageKey: FunnelStageKey }[];
}

function moved<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) {
    return [...list];
  }
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** The wizard's "confirm the AI-proposed funnel mapping" step (KAN-68 AC: "user confirms"). Every proposed step can be reordered, recategorized to a different stage, or excluded before confirming. */
export function OnboardingFunnelStep({ orgId, projectId, proposal }: OnboardingFunnelStepProps): React.ReactElement {
  const t = useTranslations('Onboarding');
  const tStage = useTranslations('Onboarding.funnelStage');
  const router = useRouter();
  const [rows, setRows] = useState<OnboardingFunnelStepRow[]>(
    proposal.map((step) => ({ eventSchemaName: step.eventSchemaName, stageKey: step.stageKey, included: true })),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  function setStage(index: number, stageKey: FunnelStageKey): void {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, stageKey } : row)));
  }

  function toggleIncluded(index: number): void {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, included: !row.included } : row)));
  }

  function move(index: number, direction: -1 | 1): void {
    setRows((current) => moved(current, index, direction));
  }

  async function handleConfirm(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const steps = rows
        .filter((row) => row.included)
        .map((row, order) => ({ eventSchemaName: row.eventSchemaName, stageKey: row.stageKey, order }));
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/onboarding/funnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground">{t('funnelStepEmpty')}</p>
        <Button type="button" onClick={handleConfirm} disabled={submitting}>
          {t('funnelStepConfirm')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">{t('funnelStepIntro')}</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('genericError')}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li
            key={row.eventSchemaName}
            className="flex flex-wrap items-center gap-2 rounded-md border border-input px-3 py-2 text-sm"
          >
            <span className="w-6 text-center text-muted-foreground">{index + 1}</span>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={row.included} onChange={() => toggleIncluded(index)} />
              <span className="font-medium">{row.eventSchemaName}</span>
            </label>
            <select
              value={row.stageKey}
              onChange={(event) => setStage(index, event.target.value as FunnelStageKey)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {FUNNEL_STAGE_KEYS.map((stageKey) => (
                <option key={stageKey} value={stageKey}>
                  {tStage(stageKey)}
                </option>
              ))}
            </select>
            <div className="ms-auto flex gap-1">
              <button
                type="button"
                aria-label={t('funnelStepMoveUp')}
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="rounded-md border border-input px-2 py-1 text-xs disabled:opacity-40"
              >
                {'↑'}
              </button>
              <button
                type="button"
                aria-label={t('funnelStepMoveDown')}
                onClick={() => move(index, 1)}
                disabled={index === rows.length - 1}
                className="rounded-md border border-input px-2 py-1 text-xs disabled:opacity-40"
              >
                {'↓'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Button type="button" onClick={handleConfirm} disabled={submitting}>
        {t('funnelStepConfirm')}
      </Button>
    </div>
  );
}
