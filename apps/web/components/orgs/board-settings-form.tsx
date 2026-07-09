'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  COMPARE_PERIODS,
  METRIC_FILTER_OPERATORS,
  TIME_GRAINS,
  type ComparePeriodRow,
  type GlobalFilterRow,
  type TimeGrainRow,
} from './board-types';

export interface BoardSettingsFormProps {
  orgId: string;
  projectId: string;
  boardId: string;
  initialName: string;
  initialDateRange: { start: string; end: string; grain: TimeGrainRow };
  initialCompare?: ComparePeriodRow;
  initialGlobalFilters: GlobalFilterRow[];
}

const NO_COMPARE = 'none';

function blankFilterRow(): GlobalFilterRow {
  return { field: '', operator: '=', value: '' };
}

/** Board-level date range, compare period, and global filters (plan `10 §2.2`: "Board-level: date range, global filters") plus rename — every tile queries against these in addition to its own dimension breakdown. */
export function BoardSettingsForm({
  orgId,
  projectId,
  boardId,
  initialName,
  initialDateRange,
  initialCompare,
  initialGlobalFilters,
}: BoardSettingsFormProps): React.ReactElement {
  const t = useTranslations('Boards');
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [start, setStart] = useState(initialDateRange.start);
  const [end, setEnd] = useState(initialDateRange.end);
  const [grain, setGrain] = useState<TimeGrainRow>(initialDateRange.grain);
  const [compare, setCompare] = useState<ComparePeriodRow | typeof NO_COMPARE>(initialCompare ?? NO_COMPARE);
  const [filters, setFilters] = useState<GlobalFilterRow[]>(initialGlobalFilters.length > 0 ? initialGlobalFilters : []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateFilter(index: number, patch: Partial<GlobalFilterRow>): void {
    setFilters((current) => current.map((filter, i) => (i === index ? { ...filter, ...patch } : filter)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (start > end) {
      setError(t('invalidDateRangeError'));
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/boards/${boardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          dateRange: { start, end, grain },
          compare: compare === NO_COMPARE ? null : compare,
          globalFilters: filters.filter((filter) => filter.field.trim().length > 0),
        }),
      });
      if (!response.ok) {
        setError(t('settingsError'));
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
        <label className="text-sm font-medium" htmlFor="board-settings-name">
          {t('nameLabel')}
        </label>
        <Input id="board-settings-name" required value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="board-settings-start">
            {t('dateRangeStartLabel')}
          </label>
          <Input id="board-settings-start" type="date" required value={start} onChange={(event) => setStart(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="board-settings-end">
            {t('dateRangeEndLabel')}
          </label>
          <Input id="board-settings-end" type="date" required value={end} onChange={(event) => setEnd(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="board-settings-grain">
            {t('grainLabel')}
          </label>
          <select
            id="board-settings-grain"
            value={grain}
            onChange={(event) => setGrain(event.target.value as TimeGrainRow)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {TIME_GRAINS.map((value) => (
              <option key={value} value={value}>
                {t(`grainOption.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="board-settings-compare">
            {t('compareLabel')}
          </label>
          <select
            id="board-settings-compare"
            value={compare}
            onChange={(event) => setCompare(event.target.value as ComparePeriodRow | typeof NO_COMPARE)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value={NO_COMPARE}>{t('compareOption.none')}</option>
            {COMPARE_PERIODS.map((value) => (
              <option key={value} value={value}>
                {t(`compareOption.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('globalFiltersLabel')}</span>
        {filters.length === 0 ? <p className="text-xs text-muted-foreground">{t('noGlobalFilters')}</p> : null}
        {filters.map((filter, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={t('filterFieldLabel')}
              placeholder={t('filterFieldPlaceholder')}
              value={filter.field}
              onChange={(event) => updateFilter(index, { field: event.target.value })}
            />
            <select
              aria-label={t('filterOperatorLabel')}
              value={filter.operator}
              onChange={(event) => updateFilter(index, { operator: event.target.value as GlobalFilterRow['operator'] })}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              {METRIC_FILTER_OPERATORS.map((operator) => (
                <option key={operator} value={operator}>
                  {operator}
                </option>
              ))}
            </select>
            <Input
              aria-label={t('filterValueLabel')}
              placeholder={t('filterValuePlaceholder')}
              value={filter.value}
              onChange={(event) => updateFilter(index, { value: event.target.value })}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setFilters((current) => current.filter((_, i) => i !== index))}>
              {t('removeFilterButton')}
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setFilters((current) => [...current, blankFilterRow()])}>
          {t('addFilterButton')}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting} className="self-start">
        {t('saveSettingsButton')}
      </Button>
    </form>
  );
}
