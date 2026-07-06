'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { blankSchemaFieldRow, SchemaFieldsEditor, type SchemaFieldRow } from './schema-fields-editor';

// See `schema-fields-editor.tsx`'s doc comment: client components must not
// import kind vocabulary from `@growthos/firebase-orm-models` either.
const SCHEMA_DEF_KINDS = ['entity', 'event', 'measure'] as const;
type SchemaDefKind = (typeof SCHEMA_DEF_KINDS)[number];

export interface RegisterSchemaDefFormProps {
  orgId: string;
  projectId: string;
}

/** Registers v1 of a new entity/event/measure schema (KAN-31 AC: "register v1"). */
export function RegisterSchemaDefForm({ orgId, projectId }: RegisterSchemaDefFormProps): React.ReactElement {
  const t = useTranslations('SchemaRegistry');
  const router = useRouter();
  const [kind, setKind] = useState<SchemaDefKind>('event');
  const [name, setName] = useState('');
  const [fields, setFields] = useState<SchemaFieldRow[]>([blankSchemaFieldRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/schema-defs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, name, fields }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error === 'duplicate_schema' ? t('duplicateSchemaError') : t('registerError'));
        return;
      }
      setName('');
      setFields([blankSchemaFieldRow()]);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="schema-def-kind">
          {t('kindLabel')}
        </label>
        <select
          id="schema-def-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as SchemaDefKind)}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {SCHEMA_DEF_KINDS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="schema-def-name">
          {t('nameLabel')}
        </label>
        <Input
          id="schema-def-name"
          required
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <SchemaFieldsEditor fields={fields} onChange={setFields} />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || fields.length === 0}>
        {t('register')}
      </Button>
    </form>
  );
}
