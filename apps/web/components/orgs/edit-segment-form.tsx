'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { SegmentEventCondition, SegmentFilterCondition } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  areEventConditionRowsValid,
  areFilterRowsValid,
  eventConditionRowsFromDefinitions,
  eventConditionRowsToDefinitions,
  filterRowsFromDefinitions,
  filterRowsToDefinitions,
  SegmentConditionEditor,
  type EventConditionRow,
  type FilterRow,
} from './segment-condition-editor';

export interface EditSegmentFormProps {
  orgId: string;
  projectId: string;
  segmentId: string;
  entitySchemaNames: string[];
  /** KAN-93 — registered `event`-kind schema names an event condition row can target, mirroring `CreateSegmentForm`'s own prop. */
  eventSchemaNames: string[];
  initialName: string;
  initialSchemaName: string;
  initialFilters: SegmentFilterCondition[];
  initialEventConditions: SegmentEventCondition[];
}

/**
 * Toggles between a compact "Edit" button and an inline full-definition edit
 * form for one segment row on the Segments page (KAN-120, row-editor
 * follow-up KAN-122) — the same "create + owner/status update only, no way
 * to fix the definition itself" gap KAN-100/KAN-117 already closed for the
 * org people registry and resource templates. `filters`/`eventConditions`
 * are edited with the same validated row editor `CreateSegmentForm` uses
 * (`SegmentConditionEditor`, shared by both forms) rather than KAN-120's
 * original pretty-printed-JSON textareas. Saving is always a full replace of
 * name/schema/filters/event conditions, matching `updateSegmentDefinition`'s
 * own posture (never a sparse patch), and preserves the segment's own id —
 * unlike delete-and-recreate, anything referencing this segment (CRM-sync
 * run history, omnisearch links) keeps working.
 */
export function EditSegmentForm({
  orgId,
  projectId,
  segmentId,
  entitySchemaNames,
  eventSchemaNames,
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
  const [filters, setFilters] = useState<FilterRow[]>(() => filterRowsFromDefinitions(initialFilters));
  const [eventConditions, setEventConditions] = useState<EventConditionRow[]>(() => eventConditionRowsFromDefinitions(initialEventConditions));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<'save' | null>(null);

  function startEditing(): void {
    setName(initialName);
    setSchemaName(initialSchemaName);
    setFilters(filterRowsFromDefinitions(initialFilters));
    setEventConditions(eventConditionRowsFromDefinitions(initialEventConditions));
    setError(null);
    setEditing(true);
  }

  const canSave =
    name.trim().length > 0 && schemaName.trim().length > 0 && areFilterRowsValid(filters) && areEventConditionRowsValid(eventConditions);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/segments/${segmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          schemaName,
          filters: filterRowsToDefinitions(filters),
          eventConditions: eventConditionRowsToDefinitions(eventConditions),
        }),
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

      <SegmentConditionEditor
        filters={filters}
        onFiltersChange={setFilters}
        eventConditions={eventConditions}
        onEventConditionsChange={setEventConditions}
        eventSchemaNames={eventSchemaNames}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !canSave}>
          {t('saveSegment')}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditSegment')}
        </Button>
      </div>
      {error === 'save' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('editSegmentError')}
        </p>
      ) : null}
    </form>
  );
}
