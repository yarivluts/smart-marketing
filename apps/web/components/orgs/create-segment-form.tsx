'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { SEGMENT_EVENT_CONDITION_KINDS, SEGMENT_FILTER_OPERATORS, type SegmentEventConditionKind, type SegmentFilterOperator } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SuggestSegmentsPanel } from './suggest-segments-panel';

export interface CreateSegmentFormProps {
  orgId: string;
  projectId: string;
  entitySchemaNames: string[];
  /** KAN-93 — registered `event`-kind schema names an event condition row can target. A project with none yet simply can't offer the event-condition section (same "nothing to pick from" posture `entitySchemaNames.length === 0` already gets for the whole form). */
  eventSchemaNames: string[];
}

export interface FilterRow {
  field: string;
  op: SegmentFilterOperator;
  value: string;
}

/**
 * One cross-schema condition row (KAN-93) — the UI slice of
 * `SegmentEventCondition`: kind + target event schema + an optional
 * lookback window + optional nested field filters over the event schema's
 * own `properties` (KAN-95 — reuses the exact same {@link FilterRow} shape
 * and row-editor pattern the top-level entity filters already use).
 */
export interface EventConditionRow {
  kind: SegmentEventConditionKind;
  schemaName: string;
  /** Empty string means "no lookback window" (the condition matches ever, not just recently). */
  withinDays: string;
  filters: FilterRow[];
}

function emptyRow(): FilterRow {
  return { field: '', op: '=', value: '' };
}

function emptyEventConditionRow(eventSchemaNames: string[]): EventConditionRow {
  return { kind: 'no_event', schemaName: eventSchemaNames[0] ?? '', withinDays: '', filters: [] };
}

/** Creates a segment definition (KAN-76, E22.2; cross-schema event conditions added by KAN-93), then navigates back to the segments list — the human-facing counterpart to the MCP `create_segment` act tool. Filter values are always submitted as strings; the service layer's `isValidSegmentFilterCondition` accepts a string value for every operator, so this keeps the row editor simple (no per-row type picker) without narrowing what a human can express. */
export function CreateSegmentForm({ orgId, projectId, entitySchemaNames, eventSchemaNames }: CreateSegmentFormProps): React.ReactElement {
  const t = useTranslations('Segments');
  const router = useRouter();
  const [name, setName] = useState('');
  const [schemaName, setSchemaName] = useState(entitySchemaNames[0] ?? '');
  const [filters, setFilters] = useState<FilterRow[]>([emptyRow()]);
  const [eventConditions, setEventConditions] = useState<EventConditionRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function isValidWithinDays(value: string): boolean {
    if (value.trim().length === 0) {
      return true;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0;
  }

  const canSubmit =
    name.trim().length > 0 &&
    schemaName.length > 0 &&
    filters.every((row) => row.field.trim().length > 0 && row.value.trim().length > 0) &&
    eventConditions.every(
      (row) =>
        row.schemaName.trim().length > 0 &&
        isValidWithinDays(row.withinDays) &&
        row.filters.every((filter) => filter.field.trim().length > 0 && filter.value.trim().length > 0),
    ) &&
    (filters.length > 0 || eventConditions.length > 0);

  function updateRow(index: number, patch: Partial<FilterRow>): void {
    setFilters((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addRow(): void {
    setFilters((rows) => [...rows, emptyRow()]);
  }

  function removeRow(index: number): void {
    setFilters((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function updateEventConditionRow(index: number, patch: Partial<EventConditionRow>): void {
    setEventConditions((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addEventConditionRow(): void {
    setEventConditions((rows) => [...rows, emptyEventConditionRow(eventSchemaNames)]);
  }

  function removeEventConditionRow(index: number): void {
    setEventConditions((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function updateEventConditionFilterRow(conditionIndex: number, filterIndex: number, patch: Partial<FilterRow>): void {
    setEventConditions((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === conditionIndex
          ? { ...row, filters: row.filters.map((filter, index) => (index === filterIndex ? { ...filter, ...patch } : filter)) }
          : row,
      ),
    );
  }

  function addEventConditionFilterRow(conditionIndex: number): void {
    setEventConditions((rows) =>
      rows.map((row, rowIndex) => (rowIndex === conditionIndex ? { ...row, filters: [...row.filters, emptyRow()] } : row)),
    );
  }

  function removeEventConditionFilterRow(conditionIndex: number, filterIndex: number): void {
    setEventConditions((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === conditionIndex ? { ...row, filters: row.filters.filter((_, index) => index !== filterIndex) } : row,
      ),
    );
  }

  /** Applies an AI-suggested segment (KAN-81): replaces the filter rows outright (a suggestion is already a complete definition, not one row to merge) and fills in the name only if the user hasn't typed one yet — never overwrites something they already wrote. */
  function applySuggestion(suggestion: { name: string; filters: FilterRow[] }): void {
    setFilters(suggestion.filters.length > 0 ? suggestion.filters : [emptyRow()]);
    setName((current) => (current.trim().length === 0 ? suggestion.name : current));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/segments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          schemaName,
          filters: filters.map((row) => ({ field: row.field, op: row.op, value: row.value })),
          eventConditions: eventConditions.map((row) => ({
            kind: row.kind,
            schemaName: row.schemaName,
            ...(row.withinDays.trim().length > 0 ? { withinDays: Number(row.withinDays) } : {}),
            ...(row.filters.length > 0
              ? { filters: row.filters.map((filter) => ({ field: filter.field, op: filter.op, value: filter.value })) }
              : {}),
          })),
        }),
      });
      if (!response.ok) {
        setError(t('createError'));
        return;
      }
      setName('');
      setFilters([emptyRow()]);
      setEventConditions([]);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="create-segment-name">
            {t('nameLabel')}
          </label>
          <Input
            id="create-segment-name"
            required
            placeholder={t('namePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="create-segment-schema">
            {t('schemaPickerLabel')}
          </label>
          <select
            id="create-segment-schema"
            value={schemaName}
            onChange={(event) => setSchemaName(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {entitySchemaNames.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>
      </div>

      <SuggestSegmentsPanel orgId={orgId} projectId={projectId} schemaName={schemaName} onApplySuggestion={applySuggestion} />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('filtersLabel')}</span>
        {filters.map((row, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <Input
              aria-label={t('filterFieldLabel')}
              placeholder={t('filterFieldPlaceholder')}
              value={row.field}
              onChange={(event) => updateRow(index, { field: event.target.value })}
            />
            <select
              aria-label={t('filterOpLabel')}
              value={row.op}
              onChange={(event) => updateRow(index, { op: event.target.value as SegmentFilterOperator })}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              {SEGMENT_FILTER_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <Input
              aria-label={t('filterValueLabel')}
              placeholder={t('filterValuePlaceholder')}
              value={row.value}
              onChange={(event) => updateRow(index, { value: event.target.value })}
            />
            <Button type="button" variant="outline" onClick={() => removeRow(index)} disabled={filters.length === 1 && eventConditions.length === 0}>
              {t('removeFilterButton')}
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="self-start" onClick={addRow}>
          {t('addFilterButton')}
        </Button>
      </div>

      {eventSchemaNames.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('eventConditionsLabel')}</span>
          <p className="text-xs text-muted-foreground">{t('eventConditionsHint')}</p>
          {eventConditions.map((row, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-md border border-input p-2">
              <div className="flex flex-wrap items-end gap-2">
                <select
                  aria-label={t('eventConditionKindLabel')}
                  value={row.kind}
                  onChange={(event) => updateEventConditionRow(index, { kind: event.target.value as SegmentEventConditionKind })}
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {SEGMENT_EVENT_CONDITION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`eventConditionKind.${kind}`)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t('eventConditionSchemaLabel')}
                  value={row.schemaName}
                  onChange={(event) => updateEventConditionRow(index, { schemaName: event.target.value })}
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {eventSchemaNames.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={t('eventConditionWithinDaysLabel')}
                  type="number"
                  min={1}
                  step={1}
                  placeholder={t('eventConditionWithinDaysPlaceholder')}
                  value={row.withinDays}
                  onChange={(event) => updateEventConditionRow(index, { withinDays: event.target.value })}
                  className="w-32"
                />
                <Button type="button" variant="outline" onClick={() => removeEventConditionRow(index)}>
                  {t('removeEventConditionButton')}
                </Button>
              </div>

              <div className="flex flex-col gap-1.5 pl-4">
                <span className="text-xs font-medium text-muted-foreground">{t('eventConditionFiltersLabel')}</span>
                {row.filters.map((filter, filterIndex) => (
                  <div key={filterIndex} className="flex flex-wrap items-end gap-2">
                    <Input
                      aria-label={t('eventConditionFilterFieldLabel')}
                      placeholder={t('filterFieldPlaceholder')}
                      value={filter.field}
                      onChange={(event) => updateEventConditionFilterRow(index, filterIndex, { field: event.target.value })}
                    />
                    <select
                      aria-label={t('eventConditionFilterOpLabel')}
                      value={filter.op}
                      onChange={(event) =>
                        updateEventConditionFilterRow(index, filterIndex, { op: event.target.value as SegmentFilterOperator })
                      }
                      className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {SEGMENT_FILTER_OPERATORS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label={t('eventConditionFilterValueLabel')}
                      placeholder={t('filterValuePlaceholder')}
                      value={filter.value}
                      onChange={(event) => updateEventConditionFilterRow(index, filterIndex, { value: event.target.value })}
                    />
                    <Button type="button" variant="outline" onClick={() => removeEventConditionFilterRow(index, filterIndex)}>
                      {t('removeEventConditionFilterButton')}
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" className="self-start" onClick={() => addEventConditionFilterRow(index)}>
                  {t('addEventConditionFilterButton')}
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" className="self-start" onClick={addEventConditionRow}>
            {t('addEventConditionButton')}
          </Button>
        </div>
      ) : null}

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
