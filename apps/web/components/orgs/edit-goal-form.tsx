'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { GOAL_DIRECTIONS, GOAL_RHYTHMS, type GoalDirection, type GoalRhythm } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MetricCatalogEntryRow } from './board-types';
import type { OrgPersonRow } from './create-goal-form';

export interface EditGoalFormProps {
  orgId: string;
  projectId: string;
  goalId: string;
  metricCatalog: MetricCatalogEntryRow[];
  people: OrgPersonRow[];
  initialName: string;
  initialMetricName: string;
  initialDirection: GoalDirection;
  initialTargetValue: number | null;
  initialRangeMin: number | null;
  initialRangeMax: number | null;
  initialStartDate: string;
  initialDeadline: string;
  initialRhythm: GoalRhythm;
  initialOwnerPersonId: string;
}

/**
 * Toggles between a compact "Edit" button and a full replace-the-definition
 * form for one goal (KAN-128) — name, metric, direction (with conditional
 * target-value vs. range-min/max inputs), start date + deadline, rhythm,
 * and owner. Fields mirror `CreateGoalForm`'s exactly (same body shape,
 * same conditional target/range inputs); the toggle scaffold mirrors
 * `EditPersonForm`'s (KAN-100). This is deliberately separate from
 * `GoalTargetInput`'s own inline target/range cell (KAN-85) — that control
 * stays untouched and keeps committing on blur from the goals list table.
 */
export function EditGoalForm(props: EditGoalFormProps): React.ReactElement {
  const { orgId, projectId, goalId, metricCatalog, people } = props;
  const t = useTranslations('Goals');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(props.initialName);
  const [metricName, setMetricName] = useState(props.initialMetricName);
  const [direction, setDirection] = useState<GoalDirection>(props.initialDirection);
  const [targetValue, setTargetValue] = useState(props.initialTargetValue !== null ? String(props.initialTargetValue) : '');
  const [rangeMin, setRangeMin] = useState(props.initialRangeMin !== null ? String(props.initialRangeMin) : '');
  const [rangeMax, setRangeMax] = useState(props.initialRangeMax !== null ? String(props.initialRangeMax) : '');
  const [startDate, setStartDate] = useState(props.initialStartDate);
  const [deadline, setDeadline] = useState(props.initialDeadline);
  const [rhythm, setRhythm] = useState<GoalRhythm>(props.initialRhythm);
  const [ownerPersonId, setOwnerPersonId] = useState(props.initialOwnerPersonId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  function startEditing(): void {
    setName(props.initialName);
    setMetricName(props.initialMetricName);
    setDirection(props.initialDirection);
    setTargetValue(props.initialTargetValue !== null ? String(props.initialTargetValue) : '');
    setRangeMin(props.initialRangeMin !== null ? String(props.initialRangeMin) : '');
    setRangeMax(props.initialRangeMax !== null ? String(props.initialRangeMax) : '');
    setStartDate(props.initialStartDate);
    setDeadline(props.initialDeadline);
    setRhythm(props.initialRhythm);
    setOwnerPersonId(props.initialOwnerPersonId);
    setError(false);
    setEditing(true);
  }

  const canSubmit =
    name.trim().length > 0 &&
    metricName.length > 0 &&
    startDate.length > 0 &&
    deadline.length > 0 &&
    ownerPersonId.length > 0 &&
    (direction === 'range' ? rangeMin.length > 0 && rangeMax.length > 0 : targetValue.length > 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={startEditing}>
        {t('editGoal')}
      </Button>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-goal-name-${goalId}`}>
            {t('nameLabel')}
          </label>
          <Input id={`edit-goal-name-${goalId}`} required value={name} onChange={(event) => setName(event.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-goal-metric-${goalId}`}>
            {t('metricLabel')}
          </label>
          <select
            id={`edit-goal-metric-${goalId}`}
            value={metricName}
            onChange={(event) => setMetricName(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {metricCatalog.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-goal-direction-${goalId}`}>
            {t('directionLabel')}
          </label>
          <select
            id={`edit-goal-direction-${goalId}`}
            value={direction}
            onChange={(event) => setDirection(event.target.value as GoalDirection)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {GOAL_DIRECTIONS.map((value) => (
              <option key={value} value={value}>
                {t(`directionOption.${value}`)}
              </option>
            ))}
          </select>
        </div>

        {direction === 'range' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor={`edit-goal-range-min-${goalId}`}>
                {t('rangeMinLabel')}
              </label>
              <Input
                id={`edit-goal-range-min-${goalId}`}
                type="number"
                required
                value={rangeMin}
                onChange={(event) => setRangeMin(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor={`edit-goal-range-max-${goalId}`}>
                {t('rangeMaxLabel')}
              </label>
              <Input
                id={`edit-goal-range-max-${goalId}`}
                type="number"
                required
                value={rangeMax}
                onChange={(event) => setRangeMax(event.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor={`edit-goal-target-value-${goalId}`}>
              {t('targetValueLabel')}
            </label>
            <Input
              id={`edit-goal-target-value-${goalId}`}
              type="number"
              required
              value={targetValue}
              onChange={(event) => setTargetValue(event.target.value)}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-goal-start-date-${goalId}`}>
            {t('startDateLabel')}
          </label>
          <Input
            id={`edit-goal-start-date-${goalId}`}
            type="date"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-goal-deadline-${goalId}`}>
            {t('deadlineLabel')}
          </label>
          <Input
            id={`edit-goal-deadline-${goalId}`}
            type="date"
            required
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-goal-rhythm-${goalId}`}>
            {t('rhythmLabel')}
          </label>
          <select
            id={`edit-goal-rhythm-${goalId}`}
            value={rhythm}
            onChange={(event) => setRhythm(event.target.value as GoalRhythm)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {GOAL_RHYTHMS.map((value) => (
              <option key={value} value={value}>
                {t(`rhythmOption.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-goal-owner-${goalId}`}>
            {t('ownerLabel')}
          </label>
          <select
            id={`edit-goal-owner-${goalId}`}
            value={ownerPersonId}
            onChange={(event) => setOwnerPersonId(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !canSubmit}>
          {t('saveGoal')}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditGoal')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('editGoalError')}
        </p>
      ) : null}
    </form>
  );
}
