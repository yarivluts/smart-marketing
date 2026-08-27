'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import {
  SEGMENT_EVENT_CONDITION_KINDS,
  SEGMENT_FILTER_OPERATORS,
  type SegmentEventCondition,
  type SegmentEventConditionKind,
  type SegmentFilterCondition,
  type SegmentFilterOperator,
} from '@growthos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

export function emptyFilterRow(): FilterRow {
  return { field: '', op: '=', value: '' };
}

export function emptyEventConditionRow(eventSchemaNames: string[]): EventConditionRow {
  return { kind: 'no_event', schemaName: eventSchemaNames[0] ?? '', withinDays: '', filters: [] };
}

export function isValidWithinDays(value: string): boolean {
  if (value.trim().length === 0) {
    return true;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

export function areFilterRowsValid(rows: readonly FilterRow[]): boolean {
  return rows.every((row) => row.field.trim().length > 0 && row.value.trim().length > 0);
}

export function areEventConditionRowsValid(rows: readonly EventConditionRow[]): boolean {
  return rows.every(
    (row) => row.schemaName.trim().length > 0 && isValidWithinDays(row.withinDays) && areFilterRowsValid(row.filters),
  );
}

/** Filter values are always submitted (and re-edited) as strings — `isValidSegmentFilterCondition` accepts a string value for every operator, so this keeps the row editor simple (no per-row type picker) without narrowing what a human can express, at the cost of round-tripping a numeric/boolean filter value (e.g. one set via the MCP `create_segment` tool) back as its string form once a human edits it. */
export function filterRowFromCondition(condition: SegmentFilterCondition): FilterRow {
  return { field: condition.field, op: condition.op, value: String(condition.value) };
}

export function filterRowsFromDefinitions(conditions: readonly SegmentFilterCondition[]): FilterRow[] {
  return conditions.map(filterRowFromCondition);
}

export function filterRowToDefinition(row: FilterRow): SegmentFilterCondition {
  return { field: row.field, op: row.op, value: row.value };
}

export function filterRowsToDefinitions(rows: readonly FilterRow[]): SegmentFilterCondition[] {
  return rows.map(filterRowToDefinition);
}

export function eventConditionRowFromDefinition(condition: SegmentEventCondition): EventConditionRow {
  return {
    kind: condition.kind,
    schemaName: condition.schemaName,
    withinDays: condition.withinDays !== undefined ? String(condition.withinDays) : '',
    filters: condition.filters ? filterRowsFromDefinitions(condition.filters) : [],
  };
}

export function eventConditionRowsFromDefinitions(conditions: readonly SegmentEventCondition[]): EventConditionRow[] {
  return conditions.map(eventConditionRowFromDefinition);
}

export function eventConditionRowToDefinition(row: EventConditionRow): SegmentEventCondition {
  return {
    kind: row.kind,
    schemaName: row.schemaName,
    ...(row.withinDays.trim().length > 0 ? { withinDays: Number(row.withinDays) } : {}),
    ...(row.filters.length > 0 ? { filters: filterRowsToDefinitions(row.filters) } : {}),
  };
}

export function eventConditionRowsToDefinitions(rows: readonly EventConditionRow[]): SegmentEventCondition[] {
  return rows.map(eventConditionRowToDefinition);
}

export interface SegmentConditionEditorProps {
  filters: FilterRow[];
  onFiltersChange: Dispatch<SetStateAction<FilterRow[]>>;
  eventConditions: EventConditionRow[];
  onEventConditionsChange: Dispatch<SetStateAction<EventConditionRow[]>>;
  eventSchemaNames: string[];
  /** The create form requires at least one filter row or event-condition row to remain, so removing the very last one is blocked; the edit form has no such minimum (a segment can be saved with zero of both). Defaults to false (no minimum). */
  requireAtLeastOneCondition?: boolean;
}

/**
 * The row-based editor for a segment's own entity filters + cross-schema
 * event conditions (KAN-93/KAN-95) — shared between `CreateSegmentForm` and
 * `EditSegmentForm` so a segment's definition is edited with the same
 * validated row UI it was created with, instead of `EditSegmentForm`'s prior
 * pretty-printed-JSON textareas (KAN-120's own documented "possible
 * follow-up, not required to close this gap" note).
 */
export function SegmentConditionEditor({
  filters,
  onFiltersChange,
  eventConditions,
  onEventConditionsChange,
  eventSchemaNames,
  requireAtLeastOneCondition = false,
}: SegmentConditionEditorProps): React.ReactElement {
  const t = useTranslations('Segments');

  function updateRow(index: number, patch: Partial<FilterRow>): void {
    onFiltersChange((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addRow(): void {
    onFiltersChange((rows) => [...rows, emptyFilterRow()]);
  }

  function removeRow(index: number): void {
    onFiltersChange((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function updateEventConditionRow(index: number, patch: Partial<EventConditionRow>): void {
    onEventConditionsChange((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addEventConditionRow(): void {
    onEventConditionsChange((rows) => [...rows, emptyEventConditionRow(eventSchemaNames)]);
  }

  function removeEventConditionRow(index: number): void {
    onEventConditionsChange((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function updateEventConditionFilterRow(conditionIndex: number, filterIndex: number, patch: Partial<FilterRow>): void {
    onEventConditionsChange((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === conditionIndex
          ? { ...row, filters: row.filters.map((filter, index) => (index === filterIndex ? { ...filter, ...patch } : filter)) }
          : row,
      ),
    );
  }

  function addEventConditionFilterRow(conditionIndex: number): void {
    onEventConditionsChange((rows) =>
      rows.map((row, rowIndex) => (rowIndex === conditionIndex ? { ...row, filters: [...row.filters, emptyFilterRow()] } : row)),
    );
  }

  function removeEventConditionFilterRow(conditionIndex: number, filterIndex: number): void {
    onEventConditionsChange((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === conditionIndex ? { ...row, filters: row.filters.filter((_, index) => index !== filterIndex) } : row,
      ),
    );
  }

  return (
    <>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => removeRow(index)}
              disabled={requireAtLeastOneCondition && filters.length === 1 && eventConditions.length === 0}
            >
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
    </>
  );
}
