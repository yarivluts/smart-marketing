'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { isValidSegmentEventCondition, isValidSegmentFilterCondition, type SegmentEventCondition, type SegmentFilterCondition } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditSegmentFormProps {
  orgId: string;
  projectId: string;
  segmentId: string;
  entitySchemaNames: string[];
  initialName: string;
  initialSchemaName: string;
  initialFilters: SegmentFilterCondition[];
  initialEventConditions: SegmentEventCondition[];
}

function toPrettyJson(value: readonly unknown[]): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Toggles between a compact "Edit" button and an inline full-definition edit
 * form for one segment row on the Segments page (KAN-120) — the same
 * "create + owner/status update only, no way to fix the definition itself"
 * gap KAN-100/KAN-117 already closed for the org people registry and
 * resource templates. `filters`/`eventConditions` are edited as
 * pretty-printed JSON, mirroring `EditTemplateForm`'s own JSON-textarea
 * convention for a similarly-nested complex field, rather than
 * re-implementing `CreateSegmentForm`'s own multi-row filter editor a
 * second time — a fuller inline row editor for this form is a possible
 * follow-up, not required to close this gap. Saving is always a full
 * replace of name/schema/filters/event conditions, matching
 * `updateSegmentDefinition`'s own posture (never a sparse patch), and
 * preserves the segment's own id — unlike delete-and-recreate, anything
 * referencing this segment (CRM-sync run history, omnisearch links) keeps
 * working.
 */
export function EditSegmentForm({
  orgId,
  projectId,
  segmentId,
  entitySchemaNames,
  initialName,
  initialSchemaName,
  initialFilters,
  initialEventConditions,
}: EditSegmentFormProps): React.ReactElement {
  const t = useTranslations('Segments');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [schemaName, setSchemaName] = useState(initialSchemaName);
  const [filtersText, setFiltersText] = useState(toPrettyJson(initialFilters));
  const [eventConditionsText, setEventConditionsText] = useState(toPrettyJson(initialEventConditions));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<'save' | 'invalid_filters' | 'invalid_event_conditions' | null>(null);

  function startEditing(): void {
    setName(initialName);
    setSchemaName(initialSchemaName);
    setFiltersText(toPrettyJson(initialFilters));
    setEventConditionsText(toPrettyJson(initialEventConditions));
    setError(null);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    let filters: unknown[];
    try {
      const trimmed = filtersText.trim();
      const parsedFilters: unknown = trimmed.length === 0 ? [] : JSON.parse(trimmed);
      if (!Array.isArray(parsedFilters) || !parsedFilters.every((entry) => isValidSegmentFilterCondition(entry))) {
        setError('invalid_filters');
        return;
      }
      filters = parsedFilters;
    } catch {
      setError('invalid_filters');
      return;
    }

    let eventConditions: unknown[];
    try {
      const trimmed = eventConditionsText.trim();
      const parsedEventConditions: unknown = trimmed.length === 0 ? [] : JSON.parse(trimmed);
      if (!Array.isArray(parsedEventConditions) || !parsedEventConditions.every((entry) => isValidSegmentEventCondition(entry))) {
        setError('invalid_event_conditions');
        return;
      }
      eventConditions = parsedEventConditions;
    } catch {
      setError('invalid_event_conditions');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/segments/${segmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, schemaName, filters, eventConditions }),
      });
      if (!response.ok) {
        setError('save');
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
        {t('editSegment')}
      </Button>
    );
  }

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-segment-name-${segmentId}`}>
          {t('nameLabel')}
        </label>
        <Input id={`edit-segment-name-${segmentId}`} required value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-segment-schema-${segmentId}`}>
          {t('schemaPickerLabel')}
        </label>
        <select
          id={`edit-segment-schema-${segmentId}`}
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
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-segment-filters-${segmentId}`}>
          {t('editFiltersJsonLabel')}
        </label>
        <textarea
          id={`edit-segment-filters-${segmentId}`}
          className="min-h-24 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
          value={filtersText}
          onChange={(event) => setFiltersText(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-segment-event-conditions-${segmentId}`}>
          {t('editEventConditionsJsonLabel')}
        </label>
        <textarea
          id={`edit-segment-event-conditions-${segmentId}`}
          className="min-h-24 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
          value={eventConditionsText}
          onChange={(event) => setEventConditionsText(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || name.trim().length === 0 || schemaName.trim().length === 0}>
          {t('saveSegment')}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditSegment')}
        </Button>
      </div>
      {error === 'invalid_filters' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('editFiltersInvalid')}
        </p>
      ) : null}
      {error === 'invalid_event_conditions' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('editEventConditionsInvalid')}
        </p>
      ) : null}
      {error === 'save' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('editSegmentError')}
        </p>
      ) : null}
    </form>
  );
}
