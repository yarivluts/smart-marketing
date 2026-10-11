'use client';

import { useTranslations } from 'next-intl';
import {
  goalTargetEntryScale,
  goalTargetFromEntry,
  goalTargetToEntry,
  metricUnitValueRange,
  resolveMetricUnit,
  type ParsedMetricUnit,
} from '@growthos/shared';

/**
 * How a human types a goal target for a metric of a given unit (KAN-213). A `ratio` metric stores a
 * 0-1 fraction, so its target is typed as a percent ("8" for 8%) and converted before it is sent;
 * every other unit is typed as stored. Client-safe: only `@growthos/shared`, never the ORM barrel.
 */
export type GoalUnitInput = ParsedMetricUnit | string | null | undefined;

function parsed(unit: GoalUnitInput): ParsedMetricUnit {
  return typeof unit === 'string' || unit === null || unit === undefined ? resolveMetricUnit(unit) : unit;
}

/** Whether a target for this unit is typed as a percent, so the form shows a "%" beside the input. */
export function isPercentEntry(unit: GoalUnitInput): boolean {
  const kind = parsed(unit).kind;
  return kind === 'ratio' || kind === 'percent';
}

/** A typed target converted to the value the API stores. */
export function storedGoalTarget(entered: number, unit: GoalUnitInput): number {
  return goalTargetFromEntry(entered, parsed(unit));
}

/** A stored target converted to the text a form shows for editing (empty for none). */
export function enteredGoalTargetText(stored: number | null, unit: GoalUnitInput): string {
  return stored === null ? '' : String(goalTargetToEntry(stored, parsed(unit)));
}

/** A typed value outside what the unit allows, as a translation key plus its values, or `null` when it is fine. */
export type GoalTargetEntryIssue = { key: 'targetOutOfRange'; min: number; max: number } | { key: 'targetBelowMinimum'; min: number };

export function goalTargetEntryIssue(entered: number, unit: GoalUnitInput): GoalTargetEntryIssue | null {
  const unitValue = parsed(unit);
  const scale = goalTargetEntryScale(unitValue);
  const { min, max } = metricUnitValueRange(unitValue);
  const entryMin = min === undefined ? undefined : min * scale;
  const entryMax = max === undefined ? undefined : max * scale;
  if ((entryMin === undefined || entered >= entryMin) && (entryMax === undefined || entered <= entryMax)) {
    return null;
  }
  return entryMax !== undefined ? { key: 'targetOutOfRange', min: entryMin ?? 0, max: entryMax } : { key: 'targetBelowMinimum', min: entryMin ?? 0 };
}

/** The translated message for the first typed value that falls outside the unit's range, or `null` when every one is fine. */
export function useGoalTargetEntryError(): (values: readonly number[], unit: GoalUnitInput) => string | null {
  const t = useTranslations('Goals');
  return (values, unit) => {
    for (const value of values) {
      const issue = goalTargetEntryIssue(value, unit);
      if (issue) {
        return issue.key === 'targetOutOfRange' ? t('targetOutOfRange', { min: issue.min, max: issue.max }) : t('targetBelowMinimum', { min: issue.min });
      }
    }
    return null;
  };
}

/** The "%" beside a percent-typed target input, and the hint that 8 means 8%. Renders nothing for any other unit. */
export function GoalTargetUnitHint({ unit }: { unit: GoalUnitInput }): React.ReactElement | null {
  const t = useTranslations('Goals');
  if (!isPercentEntry(unit)) {
    return null;
  }
  return <span className="text-xs text-muted-foreground">{t('targetEntryPercentHint')}</span>;
}
