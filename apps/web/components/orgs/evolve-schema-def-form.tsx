'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PpButton } from '@/components/pastel/primitives';
import { GitBranch, X } from 'lucide-react';
import { SchemaFieldsEditor, type SchemaFieldRow } from './schema-fields-editor';

export interface EvolveSchemaDefFormProps {
  orgId: string;
  projectId: string;
  kind: string;
  name: string;
  initialFields: SchemaFieldRow[];
  /** Called both on cancel and after a successful evolve. */
  onClose: () => void;
}

/** Registers the next version of an already-registered schema. */
export function EvolveSchemaDefForm({
  orgId,
  projectId,
  kind,
  name,
  initialFields,
  onClose,
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
      router.refresh();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4 rounded-2xl bg-pp-surface-container-low/50 p-4 border border-pp-outline-variant/30 mt-3" onSubmit={handleSubmit} noValidate>
      <h3 className="font-pp-display text-pp-headline-md text-pp-on-surface">{t('evolveHeading', { kind, name })}</h3>
      <SchemaFieldsEditor fields={fields} onChange={setFields} />
      {error ? (
        <p role="alert" className="text-sm font-medium text-pp-error">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <PpButton type="submit" variant="primary" size="sm" icon={GitBranch} disabled={submitting || fields.length === 0}>
          {t('evolveSubmit')}
        </PpButton>
        <PpButton type="button" variant="ghost" size="sm" icon={X} onClick={onClose}>
          {t('cancel')}
        </PpButton>
      </div>
    </form>
  );
}
