'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { SchemaFieldsEditor, type SchemaFieldRow } from './schema-fields-editor';

export interface EvolveSchemaDefFormProps {
  orgId: string;
  projectId: string;
  kind: string;
  name: string;
  initialFields: SchemaFieldRow[];
  onCancel: () => void;
  onSuccess: () => void;
}

/** Registers the next version of an already-registered schema, prefilled from its latest version's fields (KAN-31 AC: "evolve to v2 -> both queryable; breaking change rejected"). */
export function EvolveSchemaDefForm({
  orgId,
  projectId,
  kind,
  name,
  initialFields,
  onCancel,
  onSuccess,
}: EvolveSchemaDefFormProps): React.ReactElement {
  const t = useTranslations('SchemaRegistry');
  const router = useRouter();
  const [fields, setFields] = useState<SchemaFieldRow[]>(initialFields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/schema-defs/evolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, name, fields }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; violations?: string[] } | null;
        setError(
          body?.error === 'breaking_change'
            ? t('breakingChangeError', { violations: (body.violations ?? []).join('; ') })
            : t('evolveError'),
        );
        return;
      }
      // `router.refresh()` alone doesn't unmount this component (same key,
      // same position in the parent's list), so its local `fields` state
      // would otherwise keep showing the version just superseded instead of
      // the new active one — closing it forces a fresh prefill next time
      // "Evolve" is opened.
      router.refresh();
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4 rounded-md border border-input p-4" onSubmit={handleSubmit} noValidate>
      <h3 className="text-sm font-semibold">{t('evolveHeading', { kind, name })}</h3>
      <SchemaFieldsEditor fields={fields} onChange={setFields} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting || fields.length === 0}>
          {t('evolveSubmit')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
