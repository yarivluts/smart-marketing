'use client';

import React, { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Target, X } from 'lucide-react';
import type { GoalDirection, GoalItem, GoalRhythm } from './goal-types';

export interface CreateGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId?: string;
  projectId?: string;
  metricCatalog?: Array<{ key: string; name: string }>;
  people?: Array<{ id: string; name: string }>;
  onGoalCreated?: (newGoal: GoalItem) => void;
}

export function CreateGoalModal({
  isOpen,
  onClose,
  orgId: _orgId,
  projectId: _projectId,
  metricCatalog = [],
  people = [],
  onGoalCreated,
}: CreateGoalModalProps): React.ReactElement | null {
  const t = useTranslations('Goals');

  const [name, setName] = useState('');
  const [metricKey, setMetricKey] = useState(metricCatalog[0]?.key ?? 'revenue');
  const [direction, setDirection] = useState<GoalDirection>('maximize');
  const [targetValue, setTargetValue] = useState('500');
  const [rangeMin, setRangeMin] = useState('');
  const [rangeMax, setRangeMax] = useState('');
  const [deadline, setDeadline] = useState('2026-12-31');
  const [rhythm, setRhythm] = useState<GoalRhythm>('even');
  const [ownerId] = useState(people[0]?.id ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: {
    name: string;
    metricKey: string;
    direction: GoalDirection;
    targetValue: number;
    rangeMin?: number;
    rangeMax?: number;
  }) => {
    setName(preset.name);
    setMetricKey(preset.metricKey);
    setDirection(preset.direction);
    setTargetValue(preset.targetValue.toString());
    if (preset.rangeMin !== undefined) setRangeMin(preset.rangeMin.toString());
    if (preset.rangeMax !== undefined) setRangeMax(preset.rangeMax.toString());
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    const newGoal: GoalItem = {
      id: `goal-${Date.now()}`,
      name: name.trim(),
      metricKey,
      metricLabel: metricCatalog.find((m) => m.key === metricKey)?.name || metricKey,
      direction,
      targetValue: parseFloat(targetValue) || 100,
      actualValue: 0,
      rangeMin: rangeMin ? parseFloat(rangeMin) : null,
      rangeMax: rangeMax ? parseFloat(rangeMax) : null,
      startDate: new Date().toISOString().split('T')[0],
      deadline: deadline || '2026-12-31',
      rhythm,
      ownerId: ownerId || null,
      ownerName: people.find((p) => p.id === ownerId)?.name || 'Team Owner',
    };

    onGoalCreated?.(newGoal);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-fade-in">
      <div
        data-testid="create-goal-modal"
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in"
      >
        <div className="flex items-center justify-between pb-4 border-b border-border/70">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                {t('newGoalModalTitle')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('newGoalModalSubtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-modal-btn"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 1-Click Presets */}
        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {t('presetsTitle')}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="preset-mrr-btn"
              onClick={() =>
                handleApplyPreset({
                  name: 'Q3 MRR Scale Target',
                  metricKey: 'mrr',
                  direction: 'maximize',
                  targetValue: 100000,
                })
              }
              className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted cursor-pointer"
            >
              {t('presetMrrGrowth')}
            </button>
            <button
              type="button"
              data-testid="preset-cac-btn"
              onClick={() =>
                handleApplyPreset({
                  name: 'Target CAC Ceiling',
                  metricKey: 'cac',
                  direction: 'minimize',
                  targetValue: 45,
                })
              }
              className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted cursor-pointer"
            >
              {t('presetCacCeiling')}
            </button>
          </div>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3.5 text-xs">
          <div className="flex flex-col gap-1">
            <label htmlFor="goal-name-input" className="font-semibold text-foreground">
              {t('nameLabel')}
            </label>
            <input
              id="goal-name-input"
              data-testid="goal-name-input"
              type="text"
              required
              placeholder={t('namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="goal-direction-select" className="font-semibold text-foreground">
                {t('directionLabel')}
              </label>
              <select
                id="goal-direction-select"
                data-testid="goal-direction-select"
                value={direction}
                onChange={(e) => setDirection(e.target.value as GoalDirection)}
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs"
              >
                <option value="maximize">{t('directionOption.maximize')}</option>
                <option value="minimize">{t('directionOption.minimize')}</option>
                <option value="range">{t('directionOption.range')}</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="goal-target-input" className="font-semibold text-foreground">
                {direction === 'minimize' ? 'Ceiling Value' : t('targetValueLabel')}
              </label>
              <input
                id="goal-target-input"
                data-testid="goal-target-value-input"
                type="number"
                required
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className="h-9 rounded-lg border border-input bg-background px-3 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="goal-deadline-input" className="font-semibold text-foreground">
                {t('deadlineLabel')}
              </label>
              <input
                id="goal-deadline-input"
                data-testid="goal-deadline-input"
                type="date"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-9 rounded-lg border border-input bg-background px-3 text-xs"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="goal-rhythm-select" className="font-semibold text-foreground">
                {t('rhythmLabel')}
              </label>
              <select
                id="goal-rhythm-select"
                value={rhythm}
                onChange={(e) => setRhythm(e.target.value as GoalRhythm)}
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-xs"
              >
                <option value="even">{t('rhythmOption.even')}</option>
                <option value="work_week_weekend">{t('rhythmOption.work_week_weekend')}</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex items-center justify-end gap-2.5 pt-3 border-t border-border/70">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {t('cancelEditGoal')}
            </button>
            <button
              type="submit"
              data-testid="submit-create-goal-btn"
              disabled={isSubmitting || !name.trim()}
              className="rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              {t('createButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
