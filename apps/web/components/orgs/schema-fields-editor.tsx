'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Client components must never import from `@growthos/firebase-orm-models`
// (its barrel drags in server-only code, e.g. `node:crypto` from
// `key.service.ts`, which breaks the client webpack bundle) — this local
// copy mirrors `create-credential-form.tsx`'s own `CREDENTIAL_PROVIDERS`
// constant for the same reason.
export const SCHEMA_FIELD_TYPES = ['string', 'number', 'boolean', 'timestamp', 'object', 'array'] as const;
export type SchemaFieldRowType = (typeof SCHEMA_FIELD_TYPES)[number];

export interface SchemaFieldRow {
  name: string;
  type: SchemaFieldRowType;
  isRequired: boolean;
  isPii: boolean;
  isIdentityKey: boolean;
}

export function blankSchemaFieldRow(): SchemaFieldRow {
  return { name: '', type: 'string', isRequired: false, isPii: false, isIdentityKey: false };
}

export interface SchemaFieldsEditorProps {
  fields: SchemaFieldRow[];
  onChange: (fields: SchemaFieldRow[]) => void;
}

/** The add/edit/remove field-row builder shared by the register and evolve schema-def forms. */
export function SchemaFieldsEditor({ fields, onChange }: SchemaFieldsEditorProps): React.ReactElement {
  const t = useTranslations('SchemaRegistry');

  function updateField(index: number, patch: Partial<SchemaFieldRow>): void {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  }

  function removeField(index: number): void {
    onChange(fields.filter((_, i) => i !== index));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t('fieldsLabel')}</legend>
      {fields.map((field, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={t('fieldNamePlaceholder')}
            placeholder={t('fieldNamePlaceholder')}
            value={field.name}
            onChange={(event) => updateField(index, { name: event.target.value })}
          />
          <select
            aria-label={t('fieldTypeHeader')}
            value={field.type}
            onChange={(event) => updateField(index, { type: event.target.value as SchemaFieldRowType })}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {SCHEMA_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={field.isRequired}
              onChange={(event) => updateField(index, { isRequired: event.target.checked })}
            />
            {t('requiredLabel')}
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={field.isPii} onChange={(event) => updateField(index, { isPii: event.target.checked })} />
            {t('piiLabel')}
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={field.isIdentityKey}
              onChange={(event) => updateField(index, { isIdentityKey: event.target.checked })}
            />
            {t('identityKeyLabel')}
          </label>
          <Button type="button" variant="destructive" size="sm" onClick={() => removeField(index)}>
            {t('removeField')}
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...fields, blankSchemaFieldRow()])}>
        {t('addField')}
      </Button>
    </fieldset>
  );
}
