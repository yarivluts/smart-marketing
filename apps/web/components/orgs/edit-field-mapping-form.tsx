'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PpButton, PpField, ppInputClass } from '@/components/pastel/primitives';
import { Edit2, Save, X } from 'lucide-react';
import { blankFieldMappingRuleRow, FieldMappingRuleEditor, type FieldMappingRuleRow } from './field-mapping-rule-editor';

export interface EditFieldMappingInitialRule {
  targetField: string;
  transform: string;
  sourcePath?: string;
  castType?: string;
  template?: string;
  staticValue?: string;
}

export interface EditFieldMappingFormProps {
  orgId: string;
  projectId: string;
  fieldMappingId: string;
  initialName: string;
  initialSchemaName: string;
  initialRules: readonly EditFieldMappingInitialRule[];
  /** This mapping's own kind's currently-active registered schema names (KAN-31). */
  schemaOptions: readonly string[];
}

function toRuleRow(rule: EditFieldMappingInitialRule): FieldMappingRuleRow {
  return {
    targetField: rule.targetField,
    transform: (rule.transform as FieldMappingRuleRow['transform']) || 'rename',
    sourcePath: rule.sourcePath ?? '',
    castType: (rule.castType as FieldMappingRuleRow['castType']) || 'string',
    template: rule.template ?? '',
    staticValue: rule.staticValue ?? '',
  };
}

/** Toggles between an Edit button and an inline edit form for one field mapping row. */
export function EditFieldMappingForm({
  orgId,
  projectId,
  fieldMappingId,
  initialName,
  initialSchemaName,
  initialRules,
  schemaOptions,
}: EditFieldMappingFormProps): React.ReactElement {
  const t = useTranslations('FieldMappings');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [schemaName, setSchemaName] = useState(initialSchemaName);
  const [rules, setRules] = useState<FieldMappingRuleRow[]>(
    initialRules.length > 0 ? initialRules.map(toRuleRow) : [blankFieldMappingRuleRow()],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing(): void {
    setName(initialName);
    setSchemaName(initialSchemaName);
    setRules(initialRules.length > 0 ? initialRules.map(toRuleRow) : [blankFieldMappingRuleRow()]);
    setError(null);
    setEditing(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/field-mappings/${fieldMappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          schemaName,
          rules: rules.map((rule) => ({
            targetField: rule.targetField,
            transform: rule.transform,
            sourcePath: rule.sourcePath,
            castType: rule.castType,
            template: rule.template,
            staticValue: rule.staticValue,
          })),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; reasons?: string[] } | null;
        if (body?.error === 'target_schema_not_registered') {
          setError(t('targetSchemaNotRegisteredError'));
        } else if (body?.reasons?.length) {
          setError(body.reasons.join(' '));
        } else {
          setError(t('editMappingError'));
        }
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
      <PpButton type="button" variant="ghost" size="sm" icon={Edit2} onClick={startEditing}>
        {t('editMapping')}
      </PpButton>
    );
  }

  const schemaChoices = schemaOptions.includes(schemaName) ? schemaOptions : [schemaName, ...schemaOptions];

  return (
    <form className="flex w-full flex-col gap-4 rounded-2xl bg-pp-surface-container-low/50 p-4 border border-pp-outline-variant/30 mt-2" onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PpField label={t('nameLabel')} htmlFor={`edit-field-mapping-name-${fieldMappingId}`}>
          <input
            id={`edit-field-mapping-name-${fieldMappingId}`}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={ppInputClass}
          />
        </PpField>
        <PpField label={t('schemaNameLabel')} htmlFor={`edit-field-mapping-schema-${fieldMappingId}`}>
          <select
            id={`edit-field-mapping-schema-${fieldMappingId}`}
            required
            value={schemaName}
            onChange={(event) => setSchemaName(event.target.value)}
            className={ppInputClass}
          >
            {schemaChoices.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </PpField>
      </div>
      <FieldMappingRuleEditor rules={rules} onChange={setRules} />
      <div className="flex items-center gap-3">
        <PpButton type="submit" variant="primary" size="sm" icon={Save} disabled={submitting || name.trim().length === 0 || rules.length === 0}>
          {t('saveMapping')}
        </PpButton>
        <PpButton type="button" variant="ghost" size="sm" icon={X} disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditMapping')}
        </PpButton>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-pp-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
