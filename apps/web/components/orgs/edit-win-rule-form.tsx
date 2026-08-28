'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { WIN_RULE_FILTER_OPERATORS, WIN_TYPES, type WinRuleFilter, type WinRuleFilterOperator, type WinType } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditWinRuleFormProps {
  orgId: string;
  projectId: string;
  winRuleId: string;
  initialName: string;
  initialFilters: WinRuleFilter[];
  initialWinType: WinType;
}

function toFilterRow(filter: WinRuleFilter): WinRuleFilter {
  return { field: filter.field, operator: filter.operator, value: filter.value };
}

/**
 * Toggles between a compact "Edit" button and an inline edit form for one
 * win rule row on the project Win rules page (KAN-130 — the same "create +
 * list only, no way to fix a typo'd definition" gap KAN-100/117/119/120/
 * 121/123/124/125/126/127/128 already closed for their own sibling
 * registries). `updateWinRule` (`win-rule.service.ts`, KAN-65) already
 * supported a full replace of `name`/`filters`/`winType` — this was purely
 * a missing admin surface: `WinRuleList`'s row only ever PATCHed `active`.
 * `schemaName` stays immutable, the same "structural, not correctable"
 * posture `UpdateWinRuleParams` itself already documents (a different event
 * schema is a different rule, not a typo fix) — mirrors
 * `EditHookEndpointForm`/`EditTvPairingSettingsForm`'s own inline
 * edit-toggle shape and `CreateWinRuleForm`'s filter-row editor.
 */
export function EditWinRuleForm({
  orgId,
  projectId,
  winRuleId,
  initialName,
  initialFilters,
  initialWinType,
}: EditWinRuleFormProps): React.ReactElement {
  const t = useTranslations('WinRules');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [filters, setFilters] = useState<WinRuleFilter[]>(initialFilters.map(toFilterRow));
  const [winType, setWinType] = useState<WinType>(initialWinType);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && filters.every((filter) => filter.field.trim().length > 0 && filter.value.trim().length > 0);

  function startEditing(): void {
    setName(initialName);
    setFilters(initialFilters.map(toFilterRow));
    setWinType(initialWinType);
    setError(null);
    setEditing(true);
  }

  function updateFilter(index: number, patch: Partial<WinRuleFilter>): void {
    setFilters((current) => current.map((filter, filterIndex) => (filterIndex === index ? { ...filter, ...patch } : filter)));
  }

  function removeFilter(index: number): void {
    setFilters((current) => current.filter((_, filterIndex) => filterIndex !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/win-rules/${winRuleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters, winType }),
      });
      if (!response.ok) {
        setError(t('editRuleError'));
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
        {t('editRule')}
      </Button>
    );
  }

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-win-rule-name-${winRuleId}`}>
            {t('nameLabel')}
          </label>
          <Input
            id={`edit-win-rule-name-${winRuleId}`}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-win-rule-type-${winRuleId}`}>
            {t('winTypeFieldLabel')}
          </label>
          <select
            id={`edit-win-rule-type-${winRuleId}`}
            value={winType}
            onChange={(event) => setWinType(event.target.value as WinType)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {WIN_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`winTypeLabel.${type}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {winType !== 'generic' ? <p className="text-xs text-muted-foreground">{t(`winTypeHint.${winType}`)}</p> : null}

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
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setFilters((current) => [...current, { field: '', operator: '>', value: '' }])}>
          {t('addFilter')}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !canSubmit}>
          {t('saveRule')}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditRule')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
