'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { SEGMENT_FILTER_OPERATORS, type SegmentFilterOperator } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface CreateSegmentFormProps {
  orgId: string;
  projectId: string;
  entitySchemaNames: string[];
}

interface FilterRow {
  field: string;
  op: SegmentFilterOperator;
  value: string;
}

function emptyRow(): FilterRow {
  return { field: '', op: '=', value: '' };
}

/** Creates a segment definition (KAN-76, E22.2), then navigates back to the segments list — the human-facing counterpart to the MCP `create_segment` act tool. Filter values are always submitted as strings; the service layer's `isValidSegmentFilterCondition` accepts a string value for every operator, so this keeps the row editor simple (no per-row type picker) without narrowing what a human can express. */
export function CreateSegmentForm({ orgId, projectId, entitySchemaNames }: CreateSegmentFormProps): React.ReactElement {
  const t = useTranslations('Segments');
  const router = useRouter();
  const [name, setName] = useState('');
  const [schemaName, setSchemaName] = useState(entitySchemaNames[0] ?? '');
  const [filters, setFilters] = useState<FilterRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 && schemaName.length > 0 && filters.every((row) => row.field.trim().length > 0 && row.value.trim().length > 0);

  function updateRow(index: number, patch: Partial<FilterRow>): void {
    setFilters((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addRow(): void {
    setFilters((rows) => [...rows, emptyRow()]);
  }

  function removeRow(index: number): void {
    setFilters((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
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
        }),
      });
      if (!response.ok) {
        setError(t('createError'));
        return;
      }
      setName('');
      setFilters([emptyRow()]);
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
            <Button type="button" variant="outline" onClick={() => removeRow(index)} disabled={filters.length === 1}>
              {t('removeFilterButton')}
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="self-start" onClick={addRow}>
          {t('addFilterButton')}
        </Button>
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
