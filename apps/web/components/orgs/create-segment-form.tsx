'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SuggestSegmentsPanel } from './suggest-segments-panel';
import {
  areEventConditionRowsValid,
  areFilterRowsValid,
  emptyFilterRow,
  eventConditionRowsToDefinitions,
  filterRowsToDefinitions,
  SegmentConditionEditor,
  type EventConditionRow,
  type FilterRow,
} from './segment-condition-editor';

export interface CreateSegmentFormProps {
  orgId: string;
  projectId: string;
  entitySchemaNames: string[];
  /** KAN-93 — registered `event`-kind schema names an event condition row can target. A project with none yet simply can't offer the event-condition section (same "nothing to pick from" posture `entitySchemaNames.length === 0` already gets for the whole form). */
  eventSchemaNames: string[];
}

/** Creates a segment definition (KAN-76, E22.2; cross-schema event conditions added by KAN-93), then navigates back to the segments list — the human-facing counterpart to the MCP `create_segment` act tool. Filter values are always submitted as strings; the service layer's `isValidSegmentFilterCondition` accepts a string value for every operator, so this keeps the row editor simple (no per-row type picker) without narrowing what a human can express. */
export function CreateSegmentForm({ orgId, projectId, entitySchemaNames, eventSchemaNames }: CreateSegmentFormProps): React.ReactElement {
  const t = useTranslations('Segments');
  const router = useRouter();
  const [name, setName] = useState('');
  const [schemaName, setSchemaName] = useState(entitySchemaNames[0] ?? '');
  const [filters, setFilters] = useState<FilterRow[]>([emptyFilterRow()]);
  const [eventConditions, setEventConditions] = useState<EventConditionRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 &&
    schemaName.length > 0 &&
    areFilterRowsValid(filters) &&
    areEventConditionRowsValid(eventConditions) &&
    (filters.length > 0 || eventConditions.length > 0);

  /**
   * Applies an AI-suggested segment (KAN-81; cross-schema event conditions,
   * KAN-103): replaces the filter rows and event-condition rows outright (a
   * suggestion is already a complete definition, not rows to merge) and
   * fills in the name only if the user hasn't typed one yet — never
   * overwrites something they already wrote. `eventConditions` is only ever
   * present on a curated suggestion (e.g. the plan's own "paying, no demo"
   * example) — omitted, this leaves the form's existing event-condition
   * rows untouched, the same posture applying two plain field-heuristic
   * suggestions in a row already has for each other.
   */
  function applySuggestion(suggestion: { name: string; filters: FilterRow[]; eventConditions?: EventConditionRow[] }): void {
    setFilters(suggestion.filters.length > 0 ? suggestion.filters : [emptyFilterRow()]);
    setName((current) => (current.trim().length === 0 ? suggestion.name : current));
    if (suggestion.eventConditions) {
      setEventConditions(suggestion.eventConditions);
    }
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
          filters: filterRowsToDefinitions(filters),
          eventConditions: eventConditionRowsToDefinitions(eventConditions),
        }),
      });
      if (!response.ok) {
        setError(t('createError'));
        return;
      }
      setName('');
      setFilters([emptyFilterRow()]);
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

      <SegmentConditionEditor
        filters={filters}
        onFiltersChange={setFilters}
        eventConditions={eventConditions}
        onEventConditionsChange={setEventConditions}
        eventSchemaNames={eventSchemaNames}
        requireAtLeastOneCondition
      />

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
