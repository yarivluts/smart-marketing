'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Client components must never import from `@growthos/firebase-orm-models`
// (its barrel drags in server-only code, e.g. `node:crypto` from
// `key.service.ts`, which breaks the client webpack bundle) — this local
// copy mirrors `schema-fields-editor.tsx`'s own `SCHEMA_FIELD_TYPES`
// constant for the same reason.
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

/** The shared shape the register/evolve metric-def forms POST — `parseMetricDefRequestBody` (the API-route side) accepts exactly this. */
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

/** One version of a metric, as rendered by `MetricFamilyCard` — a plain, client-safe shape (never a `@growthos/firebase-orm-models` type, per this file's own doc comment above). */
export interface MetricVersionView {
  id: string;
  version: number;
  status: 'active' | 'superseded';
  definitionKind: MetricDefinitionKindRow;
  aggregation: { function: MetricAggFunctionRow; table: string; column?: string; timeColumn: string; filters: MetricFilterRow[] } | null;
  formula: string | null;
  dimensions: string[];
}

/** Prefills the shared editor's form state from an existing version — used by `EvolveMetricDefForm` to open pre-populated with the latest version's definition. */
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

/** The aggregation/formula/dimensions/filters builder (KAN-40) shared by the register and evolve metric-def forms. */
export function MetricDefinitionEditor({ state, onChange }: MetricDefinitionEditorProps): React.ReactElement {
  const t = useTranslations('MetricRegistry');

  function updateFilter(index: number, patch: Partial<MetricFilterRow>): void {
    onChange({ ...state, filters: state.filters.map((filter, i) => (i === index ? { ...filter, ...patch } : filter)) });
  }

  function removeFilter(index: number): void {
    onChange({ ...state, filters: state.filters.filter((_, i) => i !== index) });
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="metric-def-kind">
          {t('kindLabel')}
        </label>
        <select
          id="metric-def-kind"
          value={state.kind}
          onChange={(event) => onChange({ ...state, kind: event.target.value as MetricDefinitionKindRow })}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {METRIC_DEFINITION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(kind === 'aggregation' ? 'kindAggregation' : 'kindFormula')}
            </option>
          ))}
        </select>
      </div>

      {state.kind === 'aggregation' ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="metric-def-function">
              {t('functionLabel')}
              <select
                id="metric-def-function"
                value={state.aggFunction}
                onChange={(event) => onChange({ ...state, aggFunction: event.target.value as MetricAggFunctionRow })}
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              >
                {METRIC_AGG_FUNCTIONS.map((fn) => (
                  <option key={fn} value={fn}>
                    {fn}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="metric-def-table">
              {t('tableLabel')}
              <Input id="metric-def-table" placeholder={t('tablePlaceholder')} value={state.table} onChange={(event) => onChange({ ...state, table: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="metric-def-column">
              {t('columnLabel')}
              <Input
                id="metric-def-column"
                placeholder={t('columnPlaceholder')}
                value={state.column}
                onChange={(event) => onChange({ ...state, column: event.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="metric-def-time-column">
              {t('timeColumnLabel')}
              <Input
                id="metric-def-time-column"
                placeholder={t('timeColumnPlaceholder')}
                value={state.timeColumn}
                onChange={(event) => onChange({ ...state, timeColumn: event.target.value })}
              />
            </label>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('filtersLabel')}</legend>
            {state.filters.map((filter, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={t('filterFieldPlaceholder')}
                  placeholder={t('filterFieldPlaceholder')}
                  value={filter.field}
                  onChange={(event) => updateFilter(index, { field: event.target.value })}
                />
                <select
                  aria-label={t('filterOperatorLabel')}
                  value={filter.operator}
                  onChange={(event) => updateFilter(index, { operator: event.target.value as MetricFilterOperatorRow })}
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {METRIC_FILTER_OPERATORS.map((operator) => (
                    <option key={operator} value={operator}>
                      {operator}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={t('filterValuePlaceholder')}
                  placeholder={t('filterValuePlaceholder')}
                  value={filter.value}
                  onChange={(event) => updateFilter(index, { value: event.target.value })}
                />
                <Button type="button" variant="destructive" size="sm" onClick={() => removeFilter(index)}>
                  {t('removeFilter')}
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...state, filters: [...state.filters, blankFilterRow()] })}>
              {t('addFilter')}
            </Button>
          </fieldset>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="metric-def-formula">
            {t('formulaLabel')}
          </label>
          <Input
            id="metric-def-formula"
            placeholder={t('formulaPlaceholder')}
            value={state.formula}
            onChange={(event) => onChange({ ...state, formula: event.target.value })}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="metric-def-dimensions">
          {t('dimensionsLabel')}
        </label>
        <Input
          id="metric-def-dimensions"
          placeholder={t('dimensionsPlaceholder')}
          value={state.dimensions}
          onChange={(event) => onChange({ ...state, dimensions: event.target.value })}
        />
      </div>
    </fieldset>
  );
}
