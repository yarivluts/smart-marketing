'use client';

import React, { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Target, X } from 'lucide-react';
import { GOAL_DIRECTIONS, computeElapsedFraction, type GoalDirection, type GoalRhythm } from '@growthos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calculateDaysRemaining, type UnifiedGoalItem } from '@/lib/orgs/funnel-goals-synthesizer';
import type { GoalSummaryView } from '@/lib/orgs/goal-view';

export interface CreateGoalModalProps {
  orgId: string;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onGoalCreated?: (newGoal: UnifiedGoalItem) => void;
  metricCatalog?: { name: string }[];
  people?: { id: string; name: string }[];
}

export function CreateGoalModal({
  orgId,
  projectId,
  isOpen,
  onClose,
  onGoalCreated,
  metricCatalog = [],
  people = [],
}: CreateGoalModalProps): React.ReactElement | null {
  const t = useTranslations('Goals');

  const [name, setName] = useState('');
  const [metricName, setMetricName] = useState(metricCatalog[0]?.name ?? 'mrr_usd');
  const [direction, setDirection] = useState<GoalDirection>('maximize');
  const [targetValue, setTargetValue] = useState('');
  const [rangeMin, setRangeMin] = useState('');
  const [rangeMax, setRangeMax] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState(
    new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
  );
  const [rhythm, setRhythm] = useState<GoalRhythm>('work_week_weekend');
  const [ownerPersonId, setOwnerPersonId] = useState(people[0]?.id ?? 'default-owner');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function applyPreset(presetType: 'mrr' | 'leads' | 'cac' | 'cvr'): void {
    const today = new Date().toISOString().slice(0, 10);
    const in60d = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    setStartDate(today);
    setDeadline(in60d);

    if (presetType === 'mrr') {
      setName('Quarterly MRR Expansion');
      setMetricName('mrr_usd');
      setDirection('maximize');
      setTargetValue('100000');
      setRhythm('work_week_weekend');
    } else if (presetType === 'leads') {
      setName('Monthly Qualified Leads');
      setMetricName('qualified_leads');
      setDirection('maximize');
      setTargetValue('1500');
      setRhythm('even');
    } else if (presetType === 'cac') {
      setName('Blended CAC Guardrail');
      setMetricName('blended_cac_usd');
      setDirection('minimize');
      setTargetValue('45');
      setRhythm('even');
    } else if (presetType === 'cvr') {
      setName('Demo-to-Close Conversion');
      setMetricName('demo_sign_cvr_pct');
      setDirection('maximize');
      setTargetValue('25');
      setRhythm('work_week_weekend');
    }
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload = {
        name,
        metricName,
        direction,
        ...(direction === 'range'
          ? { rangeMin: Number(rangeMin), rangeMax: Number(rangeMax) }
          : { targetValue: Number(targetValue) }),
        startDate,
        deadline,
        rhythm,
        ownerPersonId,
      };

      const res = await fetch(`/api/orgs/${orgId}/projects/${projectId}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      /*
        A failed create is an error. It used to add a locally invented goal instead - "on track",
        projected to hit its target, 60 days left - that existed nowhere and vanished on reload.
      */
      if (!res.ok) {
        setError(t('createError'));
        return;
      }

      const data = (await res.json()) as { goal: GoalSummaryView };
      const created = data.goal;
      // The new goal has not been measured yet, so it carries no progress figures: the card
      // shows its target and says progress appears on the next refresh.
      const newGoal: UnifiedGoalItem = {
        id: created.id,
        name: created.name,
        metricName: created.metricName,
        direction: created.direction,
        targetValue: created.targetValue,
        rangeMin: created.rangeMin,
        rangeMax: created.rangeMax,
        startDate,
        deadline: created.deadline,
        rhythm,
        ownerPersonId: created.ownerPersonId,
        ownerName: people.find((p) => p.id === created.ownerPersonId)?.name ?? created.ownerPersonId,
        progressKind: 'pending',
        actualValue: null,
        expectedAtNow: null,
        projectedFinalValue: null,
        percentFilled: null,
        status: null,
        statusColor: null,
        isGoalMet: null,
        elapsedFraction: computeElapsedFraction(startDate, created.deadline, new Date().toISOString().slice(0, 10), rhythm),
        daysRemaining: calculateDaysRemaining(created.deadline),
        isPaused: false,
      };
      onGoalCreated?.(newGoal);
      onClose();
    } catch {
      setError(t('createError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="create-goal-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div
        data-testid="create-goal-modal"
        className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('newGoalModalTitle')}</h2>
              <p className="text-xs text-muted-foreground">{t('newGoalModalSubtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="modal-close-btn"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 1-Click Presets */}
        <div className="mt-4">
          <span className="text-xs font-semibold text-muted-foreground">{t('presetsTitle')}</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="preset-mrr-btn"
              onClick={() => applyPreset('mrr')}
              className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent/10 cursor-pointer"
            >
              {t('presetMrrGrowth')}
            </button>
            <button
              type="button"
              data-testid="preset-leads-btn"
              onClick={() => applyPreset('leads')}
              className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent/10 cursor-pointer"
            >
              {t('presetLeadVolume')}
            </button>
            <button
              type="button"
              data-testid="preset-cac-btn"
              onClick={() => applyPreset('cac')}
              className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent/10 cursor-pointer"
            >
              {t('presetCacCeiling')}
            </button>
            <button
              type="button"
              data-testid="preset-cvr-btn"
              onClick={() => applyPreset('cvr')}
              className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent/10 cursor-pointer"
            >
              {t('presetConversionRate')}
            </button>
          </div>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-xs font-medium" htmlFor="goal-name">{t('nameLabel')}</label>
              <Input
                id="goal-name"
                data-testid="modal-input-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" htmlFor="goal-metric">{t('metricLabel')}</label>
              <Input
                id="goal-metric"
                data-testid="modal-input-metric"
                required
                value={metricName}
                onChange={(e) => setMetricName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" htmlFor="goal-direction">{t('directionLabel')}</label>
              <select
                id="goal-direction"
                data-testid="modal-select-direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as GoalDirection)}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs"
              >
                {GOAL_DIRECTIONS.map((dir) => (
                  <option key={dir} value={dir}>{t(`directionOption.${dir}`)}</option>
                ))}
              </select>
            </div>

            {direction === 'range' ? (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" htmlFor="goal-min">{t('rangeMinLabel')}</label>
                  <Input
                    id="goal-min"
                    data-testid="modal-input-min"
                    type="number"
                    required
                    value={rangeMin}
                    onChange={(e) => setRangeMin(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" htmlFor="goal-max">{t('rangeMaxLabel')}</label>
                  <Input
                    id="goal-max"
                    data-testid="modal-input-max"
                    type="number"
                    required
                    value={rangeMax}
                    onChange={(e) => setRangeMax(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs font-medium" htmlFor="goal-target">{t('targetValueLabel')}</label>
                <Input
                  id="goal-target"
                  data-testid="modal-input-target"
                  type="number"
                  required
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" htmlFor="goal-start">{t('startDateLabel')}</label>
              <Input
                id="goal-start"
                data-testid="modal-input-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" htmlFor="goal-deadline">{t('deadlineLabel')}</label>
              <Input
                id="goal-deadline"
                data-testid="modal-input-deadline"
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>

            {people.length > 0 && (
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs font-medium" htmlFor="goal-owner">{t('ownerLabel')}</label>
                <select
                  id="goal-owner"
                  data-testid="modal-select-owner"
                  value={ownerPersonId}
                  onChange={(e) => setOwnerPersonId(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="mt-2 flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button
              type="button"
              data-testid="modal-cancel-btn"
              variant="outline"
              onClick={onClose}
            >
              {t('cancelEditGoal')}
            </Button>
            <Button
              type="submit"
              data-testid="modal-submit-btn"
              disabled={submitting}
            >
              {t('createButton')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
