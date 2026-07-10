'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { GOAL_DIRECTIONS, GOAL_RHYTHMS, type GoalDirection, type GoalRhythm } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MetricCatalogEntryRow } from './board-types';

/** A plain, client-safe mirror of `OrgPersonModel` — the same "no `@growthos/firebase-orm-models` import in a client component" reasoning `MetricCatalogEntryRow`'s own doc comment (`board-types.ts`) gives. */
export interface OrgPersonRow {
  id: string;
  name: string;
}

export interface CreateGoalFormProps {
  orgId: string;
  projectId: string;
  metricCatalog: MetricCatalogEntryRow[];
  people: OrgPersonRow[];
}

/** Creates a goal, then navigates to its detail page (KAN-64, E12.1). Fields: name, metric picker, direction (with conditional target-value vs. range-min/max inputs), start date + deadline, rhythm, and owner — mirrors `CreateBoardForm`'s client-form conventions. */
export function CreateGoalForm({ orgId, projectId, metricCatalog, people }: CreateGoalFormProps): React.ReactElement {
  const t = useTranslations('Goals');
  const router = useRouter();
  const [name, setName] = useState('');
  const [metricName, setMetricName] = useState(metricCatalog[0]?.name ?? '');
  const [direction, setDirection] = useState<GoalDirection>('maximize');
  const [targetValue, setTargetValue] = useState('');
  const [rangeMin, setRangeMin] = useState('');
  const [rangeMax, setRangeMax] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [rhythm, setRhythm] = useState<GoalRhythm>('even');
  const [ownerPersonId, setOwnerPersonId] = useState(people[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 &&
    metricName.length > 0 &&
    startDate.length > 0 &&
    deadline.length > 0 &&
    ownerPersonId.length > 0 &&
    (direction === 'range' ? rangeMin.length > 0 && rangeMax.length > 0 : targetValue.length > 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/goals`, {
        method: 'POST',
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
        setError(t('createError'));
        return;
      }
      const body = (await response.json()) as { goal: { id: string } };
      router.push(`/orgs/${orgId}/projects/${projectId}/goals/${body.goal.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="create-goal-name">
            {t('nameLabel')}
          </label>
          <Input
            id="create-goal-name"
            required
            placeholder={t('namePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="create-goal-metric">
            {t('metricLabel')}
          </label>
          <select
            id="create-goal-metric"
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
          <label className="text-sm font-medium" htmlFor="create-goal-direction">
            {t('directionLabel')}
          </label>
          <select
            id="create-goal-direction"
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
              <label className="text-sm font-medium" htmlFor="create-goal-range-min">
                {t('rangeMinLabel')}
              </label>
              <Input
                id="create-goal-range-min"
                type="number"
                required
                value={rangeMin}
                onChange={(event) => setRangeMin(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="create-goal-range-max">
                {t('rangeMaxLabel')}
              </label>
              <Input
                id="create-goal-range-max"
                type="number"
                required
                value={rangeMax}
                onChange={(event) => setRangeMax(event.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="create-goal-target-value">
              {t('targetValueLabel')}
            </label>
            <Input
              id="create-goal-target-value"
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
          <label className="text-sm font-medium" htmlFor="create-goal-start-date">
            {t('startDateLabel')}
          </label>
          <Input
            id="create-goal-start-date"
            type="date"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="create-goal-deadline">
            {t('deadlineLabel')}
          </label>
          <Input
            id="create-goal-deadline"
            type="date"
            required
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="create-goal-rhythm">
            {t('rhythmLabel')}
          </label>
          <select
            id="create-goal-rhythm"
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
          <label className="text-sm font-medium" htmlFor="create-goal-owner">
            {t('ownerLabel')}
          </label>
          <select
            id="create-goal-owner"
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

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || !canSubmit} className="self-start">
        {t('createButton')}
      </Button>
    </form>
  );
}
