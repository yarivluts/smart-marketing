'use client';

import { useTranslations } from 'next-intl';
import { WIN_RULE_FILTER_OPERATORS, type WinRuleFilterOperator } from '@growthos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface WinRuleFilterRow {
  field: string;
  operator: WinRuleFilterOperator;
  value: string;
}

export function emptyWinRuleFilterRow(): WinRuleFilterRow {
  return { field: '', operator: '>', value: '' };
}

export interface WinRuleFilterEditorProps {
  filters: WinRuleFilterRow[];
  onChange: (filters: WinRuleFilterRow[]) => void;
}

/**
 * The add/edit/remove filter-row builder for a win rule's filter list —
 * shared by `CreateWinRuleForm` and `EditWinRuleForm` (KAN-127) rather than
 * each reimplementing the same row editor, the same reuse posture
 * `FieldMappingRuleEditor` established for its own create/edit pair.
 */
export function WinRuleFilterEditor({ filters, onChange }: WinRuleFilterEditorProps): React.ReactElement {
  const t = useTranslations('WinRules');

  function updateFilter(index: number, patch: Partial<WinRuleFilterRow>): void {
    onChange(filters.map((filter, filterIndex) => (filterIndex === index ? { ...filter, ...patch } : filter)));
  }

  function removeFilter(index: number): void {
    onChange(filters.filter((_, filterIndex) => filterIndex !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t('filtersLabel')}</span>
      {filters.length === 0 ? <p className="text-xs text-muted-foreground">{t('noFilters')}</p> : null}
      {filters.map((filter, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={t('filterFieldLabel')}
            placeholder={t('filterFieldPlaceholder')}
            value={filter.field}
            onChange={(event) => updateFilter(index, { field: event.target.value })}
            className="w-48"
          />
          <select
            aria-label={t('filterOperatorLabel')}
            value={filter.operator}
            onChange={(event) => updateFilter(index, { operator: event.target.value as WinRuleFilterOperator })}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {WIN_RULE_FILTER_OPERATORS.map((operator) => (
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
            className="w-32"
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => removeFilter(index)}>
            {t('removeFilter')}
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...filters, emptyWinRuleFilterRow()])}>
        {t('addFilter')}
      </Button>
    </div>
  );
}
