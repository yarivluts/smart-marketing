'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { PpButton, PpField, ppInputClass } from '@/components/pastel/primitives';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const METRIC_AGG_FUNCTIONS = ['sum', 'count', 'count_distinct', 'avg', 'min', 'max'] as const;
export type MetricAggFunctionRow = (typeof METRIC_AGG_FUNCTIONS)[number];

export const METRIC_FILTER_OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'in'] as const;
export type MetricFilterOperatorRow = (typeof METRIC_FILTER_OPERATORS)[number];

export const METRIC_DEFINITION_KINDS = ['aggregation', 'formula'] as const;
export type MetricDefinitionKindRow = (typeof METRIC_DEFINITION_KINDS)[number];

export interface MetricFilterRow {
  field: string;
  operator: MetricFilterOperatorRow;
  value: string;
}

export interface MetricDefinitionFormState {
  kind: MetricDefinitionKindRow;
  aggFunction: MetricAggFunctionRow;
  table: string;
  column: string;
  timeColumn: string;
  filters: MetricFilterRow[];
  formula: string;
  /** Raw comma-separated input — split into an array only at submit time. */
  dimensions: string;
}

export function blankMetricDefinitionFormState(): MetricDefinitionFormState {
  return { kind: 'aggregation', aggFunction: 'sum', table: '', column: '', timeColumn: '', filters: [], formula: '', dimensions: '' };
}

export interface MetricDefinitionRequestBody {
  definition:
    | {
        kind: 'aggregation';
        aggregation: { function: string; table: string; column?: string; timeColumn: string; filters: { field: string; operator: string; value: string }[] };
      }
    | { kind: 'formula'; formula: string };
  dimensions: string[];
}

/** The shared shape the register/evolve metric-def forms POST. */
export function metricDefinitionFormStateToRequestBody(state: MetricDefinitionFormState): MetricDefinitionRequestBody {
  const dimensions = state.dimensions
    .split(',')
    .map((dimension) => dimension.trim())
    .filter((dimension) => dimension.length > 0);

  if (state.kind === 'formula') {
    return { definition: { kind: 'formula', formula: state.formula }, dimensions };
  }

  return {
    definition: {
      kind: 'aggregation',
      aggregation: {
        function: state.aggFunction,
        table: state.table,
        ...(state.column.trim() ? { column: state.column.trim() } : {}),
        timeColumn: state.timeColumn,
        filters: state.filters.map((filter) => ({ field: filter.field, operator: filter.operator, value: filter.value })),
      },
    },
    dimensions,
  };
}

function blankFilterRow(): MetricFilterRow {
  return { field: '', operator: '=', value: '' };
}

export interface MetricVersionView {
  id: string;
  version: number;
  status: 'active' | 'superseded';
  definitionKind: MetricDefinitionKindRow;
  aggregation: { function: MetricAggFunctionRow; table: string; column?: string; timeColumn: string; filters: MetricFilterRow[] } | null;
  formula: string | null;
  dimensions: string[];
}

export function metricVersionToFormState(version: MetricVersionView): MetricDefinitionFormState {
  return {
    kind: version.definitionKind,
    aggFunction: version.aggregation?.function ?? 'sum',
    table: version.aggregation?.table ?? '',
    column: version.aggregation?.column ?? '',
    timeColumn: version.aggregation?.timeColumn ?? '',
    filters: version.aggregation?.filters ?? [],
    formula: version.formula ?? '',
    dimensions: version.dimensions.join(', '),
  };
}

export interface MetricDefinitionEditorProps {
  state: MetricDefinitionFormState;
  onChange: (state: MetricDefinitionFormState) => void;
}

/** The aggregation/formula/dimensions/filters builder (KAN-40) shared by register and evolve metric-def forms. */
export function MetricDefinitionEditor({ state, onChange }: MetricDefinitionEditorProps): React.ReactElement {
  const t = useTranslations('MetricRegistry');
  const idBase = useId();

  function updateFilter(index: number, patch: Partial<MetricFilterRow>): void {
    onChange({ ...state, filters: state.filters.map((filter, i) => (i === index ? { ...filter, ...patch } : filter)) });
  }

  function removeFilter(index: number): void {
    onChange({ ...state, filters: state.filters.filter((_, i) => i !== index) });
  }

  return (
    <fieldset className="flex flex-col gap-4">
      <PpField label={t('kindLabel')} htmlFor={`${idBase}-kind`}>
        <select
          id={`${idBase}-kind`}
          value={state.kind}
          onChange={(event) => onChange({ ...state, kind: event.target.value as MetricDefinitionKindRow })}
          className={ppInputClass}
        >
          {METRIC_DEFINITION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(kind === 'aggregation' ? 'kindAggregation' : 'kindFormula')}
            </option>
          ))}
        </select>
      </PpField>

      {state.kind === 'aggregation' ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <PpField label={t('functionLabel')} htmlFor={`${idBase}-function`}>
              <select
                id={`${idBase}-function`}
                value={state.aggFunction}
                onChange={(event) => onChange({ ...state, aggFunction: event.target.value as MetricAggFunctionRow })}
                className={ppInputClass}
              >
                {METRIC_AGG_FUNCTIONS.map((fn) => (
                  <option key={fn} value={fn}>
                    {fn}
                  </option>
                ))}
              </select>
            </PpField>
            <PpField label={t('tableLabel')} htmlFor={`${idBase}-table`}>
              <input
                id={`${idBase}-table`}
                placeholder={t('tablePlaceholder')}
                value={state.table}
                onChange={(event) => onChange({ ...state, table: event.target.value })}
                className={ppInputClass}
              />
            </PpField>
            <PpField label={t('columnLabel')} htmlFor={`${idBase}-column`}>
              <input
                id={`${idBase}-column`}
                placeholder={t('columnPlaceholder')}
                value={state.column}
                onChange={(event) => onChange({ ...state, column: event.target.value })}
                className={ppInputClass}
              />
            </PpField>
            <PpField label={t('timeColumnLabel')} htmlFor={`${idBase}-time-column`}>
              <input
                id={`${idBase}-time-column`}
                placeholder={t('timeColumnPlaceholder')}
                value={state.timeColumn}
                onChange={(event) => onChange({ ...state, timeColumn: event.target.value })}
                className={ppInputClass}
              />
            </PpField>
          </div>

          <fieldset className="flex flex-col gap-3 rounded-2xl bg-pp-surface-container-low/60 p-4 border border-pp-outline-variant/30">
            <legend className="text-pp-label-sm uppercase tracking-wider text-pp-outline font-bold">{t('filtersLabel')}</legend>
            {state.filters.map((filter, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={t('filterFieldPlaceholder')}
                  placeholder={t('filterFieldPlaceholder')}
                  value={filter.field}
                  onChange={(event) => updateFilter(index, { field: event.target.value })}
                  className={cn(ppInputClass, 'w-auto min-w-[140px] flex-1 text-xs py-2')}
                />
                <select
                  aria-label={t('filterOperatorLabel')}
                  value={filter.operator}
                  onChange={(event) => updateFilter(index, { operator: event.target.value as MetricFilterOperatorRow })}
                  className={cn(ppInputClass, 'w-[90px] text-xs py-2')}
                >
                  {METRIC_FILTER_OPERATORS.map((operator) => (
                    <option key={operator} value={operator}>
                      {operator}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={t('filterValuePlaceholder')}
                  placeholder={t('filterValuePlaceholder')}
                  value={filter.value}
                  onChange={(event) => updateFilter(index, { value: event.target.value })}
                  className={cn(ppInputClass, 'w-auto min-w-[140px] flex-1 text-xs py-2')}
                />
                <PpButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  className="text-pp-error hover:bg-pp-error-container/40"
                  onClick={() => removeFilter(index)}
                >
                  {t('removeFilter')}
                </PpButton>
              </div>
            ))}
            <div>
              <PpButton
                type="button"
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={() => onChange({ ...state, filters: [...state.filters, blankFilterRow()] })}
              >
                {t('addFilter')}
              </PpButton>
            </div>
          </fieldset>
        </div>
      ) : (
        <PpField label={t('formulaLabel')} htmlFor={`${idBase}-formula`}>
          <input
            id={`${idBase}-formula`}
            placeholder={t('formulaPlaceholder')}
            value={state.formula}
            onChange={(event) => onChange({ ...state, formula: event.target.value })}
            className={cn(ppInputClass, 'font-mono text-sm')}
          />
        </PpField>
      )}

      <PpField label={t('dimensionsLabel')} htmlFor={`${idBase}-dimensions`}>
        <input
          id={`${idBase}-dimensions`}
          placeholder={t('dimensionsPlaceholder')}
          value={state.dimensions}
          onChange={(event) => onChange({ ...state, dimensions: event.target.value })}
          className={ppInputClass}
        />
      </PpField>
    </fieldset>
  );
}
