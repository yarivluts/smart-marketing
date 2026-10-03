'use client';

import { useTranslations } from 'next-intl';
import { PpButton, ppInputClass } from '@/components/pastel/primitives';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <fieldset className="flex flex-col gap-3">
      <legend className="text-pp-label-sm uppercase tracking-wider text-pp-outline font-bold">{t('fieldsLabel')}</legend>
      {fields.map((field, index) => (
        <div key={index} className="flex flex-wrap items-center gap-3 rounded-2xl bg-pp-surface-container-low/70 p-3 border border-pp-outline-variant/30">
          <div className="flex-1 min-w-[180px]">
            <input
              aria-label={t('fieldNamePlaceholder')}
              placeholder={t('fieldNamePlaceholder')}
              value={field.name}
              onChange={(event) => updateField(index, { name: event.target.value })}
              className={cn(ppInputClass, 'text-xs font-mono py-2')}
            />
          </div>
          <div className="w-[130px]">
            <select
              aria-label={t('fieldTypeHeader')}
              value={field.type}
              onChange={(event) => updateField(index, { type: event.target.value as SchemaFieldRowType })}
              className={cn(ppInputClass, 'text-xs py-2')}
            >
              {SCHEMA_FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 text-xs text-pp-on-surface">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={field.isRequired}
                onChange={(event) => updateField(index, { isRequired: event.target.checked })}
                className="rounded border-pp-outline/40 text-pp-primary focus:ring-pp-primary/40"
              />
              <span className="font-medium">{t('requiredLabel')}</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={field.isPii}
                onChange={(event) => updateField(index, { isPii: event.target.checked })}
                className="rounded border-pp-outline/40 text-pp-primary focus:ring-pp-primary/40"
              />
              <span className="font-medium">{t('piiLabel')}</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={field.isIdentityKey}
                onChange={(event) => updateField(index, { isIdentityKey: event.target.checked })}
                className="rounded border-pp-outline/40 text-pp-primary focus:ring-pp-primary/40"
              />
              <span className="font-medium">{t('identityKeyLabel')}</span>
            </label>
          </div>
          <PpButton
            type="button"
            variant="ghost"
            size="sm"
            icon={Trash2}
            className="text-pp-error hover:bg-pp-error-container/40"
            onClick={() => removeField(index)}
          >
            {t('removeField')}
          </PpButton>
        </div>
      ))}
      <div>
        <PpButton
          type="button"
          variant="secondary"
          size="sm"
          icon={Plus}
          onClick={() => onChange([...fields, blankSchemaFieldRow()])}
        >
          {t('addField')}
        </PpButton>
      </div>
    </fieldset>
  );
}
