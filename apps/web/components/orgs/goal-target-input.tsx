'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { GoalModel } from '@growthos/firebase-orm-models';

export interface GoalTargetInputProps {
  orgId: string;
  projectId: string;
  goalId: string;
  goalName: string;
  direction: GoalModel['direction'];
  targetValue: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
}

/**
 * Inline-editable target cell for the goals table (KAN-85, plan `14 §Gap
 * 15`'s "inline editing... of targets/values directly in report tables") —
 * mirrors `CampaignTargetInput`'s commit-on-blur pattern. Unlike a campaign
 * spend target, a goal's target is required (`createGoal` already enforces
 * this), so there is no empty-value-clears-it path here: an empty or
 * invalid value is rejected and the field reverts to its last known-good
 * value rather than DELETEing anything.
 */
export function GoalTargetInput(props: GoalTargetInputProps): React.ReactElement {
  const { orgId, projectId, goalId, goalName, direction } = props;
  const t = useTranslations('Goals');
  const router = useRouter();

  const [targetValue, setTargetValue] = useState(props.targetValue !== null ? String(props.targetValue) : '');
  const [rangeMin, setRangeMin] = useState(props.rangeMin !== null ? String(props.rangeMin) : '');
  const [rangeMax, setRangeMax] = useState(props.rangeMax !== null ? String(props.rangeMax) : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rangeMinInputRef = useRef<HTMLInputElement>(null);
  const rangeMaxInputRef = useRef<HTMLInputElement>(null);

  function resetTargetValue(): void {
    setTargetValue(props.targetValue !== null ? String(props.targetValue) : '');
  }

  function resetRange(): void {
    setRangeMin(props.rangeMin !== null ? String(props.rangeMin) : '');
    setRangeMax(props.rangeMax !== null ? String(props.rangeMax) : '');
  }

  async function patch(body: Record<string, number>): Promise<boolean> {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(t('targetUpdateError'));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      // Network failure (offline, DNS, etc.) — treat the same as a non-ok response rather than
      // letting the rejection propagate unhandled and leave the input silently un-reverted.
      setError(t('targetUpdateError'));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function commitTargetValue(): Promise<void> {
    const trimmed = targetValue.trim();
    const numeric = Number(trimmed);
    if (trimmed.length === 0 || !Number.isFinite(numeric)) {
      setError(t('targetUpdateError'));
      resetTargetValue();
      return;
    }
    if (!(await patch({ targetValue: numeric }))) {
      resetTargetValue();
    }
  }

  /**
   * Tabbing from the min field to the max field (or vice versa) fires this
   * field's own blur first, while the *other* field still holds its
   * not-yet-edited stale value — committing right then would validate the
   * just-typed value against that stale sibling and can spuriously fail
   * (e.g. moving a 20-40 band up to 45-50: typing 45 into min and tabbing to
   * max would compare 45 against the still-stale max=40 and reject). Skip
   * the commit when focus is moving to the sibling range input; it fires
   * again — with both fields now current — on the blur that actually leaves
   * the pair.
   */
  async function commitRange(event: React.FocusEvent<HTMLInputElement>): Promise<void> {
    const sibling = event.target === rangeMinInputRef.current ? rangeMaxInputRef.current : rangeMinInputRef.current;
    if (event.relatedTarget === sibling) {
      return;
    }

    const minTrimmed = rangeMin.trim();
    const maxTrimmed = rangeMax.trim();
    const min = Number(minTrimmed);
    const max = Number(maxTrimmed);
    if (minTrimmed.length === 0 || maxTrimmed.length === 0 || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      setError(t('targetUpdateError'));
      resetRange();
      return;
    }
    if (!(await patch({ rangeMin: min, rangeMax: max }))) {
      resetRange();
    }
  }

  if (direction === 'range') {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={rangeMinInputRef}
          type="number"
          step="any"
          aria-label={t('rangeMinInputLabel', { goalName })}
          value={rangeMin}
          disabled={pending}
          onChange={(event) => setRangeMin(event.target.value)}
          onBlur={(event) => void commitRange(event)}
          className="h-8 w-20 rounded-md border border-input bg-background px-2 text-xs"
        />
        <span className="text-xs text-muted-foreground">{t('rangeSeparator')}</span>
        <input
          ref={rangeMaxInputRef}
          type="number"
          step="any"
          aria-label={t('rangeMaxInputLabel', { goalName })}
          value={rangeMax}
          disabled={pending}
          onChange={(event) => setRangeMax(event.target.value)}
          onBlur={(event) => void commitRange(event)}
          className="h-8 w-20 rounded-md border border-input bg-background px-2 text-xs"
        />
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        step="any"
        aria-label={t('targetValueInputLabel', { goalName })}
        value={targetValue}
        disabled={pending}
        onChange={(event) => setTargetValue(event.target.value)}
        onBlur={() => void commitTargetValue()}
        className="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
