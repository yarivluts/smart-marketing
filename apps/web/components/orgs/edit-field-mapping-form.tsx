'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  /** This mapping's own kind's currently-active registered schema names (KAN-31) — `initialSchemaName` is always included even if it's fallen out of this set, so re-saving without touching the picker never silently changes the target. */
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

/**
 * Toggles between a compact "Edit" button and an inline edit form for one
 * field mapping row on the Field Mappings admin page (KAN-121 — the same
 * "create + list only, no way to fix a typo'd name or a wrong JSONPath
 * rule" gap KAN-100/KAN-117/KAN-119/KAN-120 already closed for their own
 * sibling registries). Reuses the exact `FieldMappingRuleEditor` the
 * create-mapping form already uses for its own rule rows, rather than
 * re-implementing a second rule editor. `kind` stays immutable — see
 * `updateFieldMapping`'s own doc comment.
 */
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
      <Button type="button" variant="outline" size="sm" onClick={startEditing}>
        {t('editMapping')}
      </Button>
    );
  }

  const schemaChoices = schemaOptions.includes(schemaName) ? schemaOptions : [schemaName, ...schemaOptions];

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-field-mapping-name-${fieldMappingId}`}>
          {t('nameLabel')}
        </label>
        <Input
          id={`edit-field-mapping-name-${fieldMappingId}`}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`edit-field-mapping-schema-${fieldMappingId}`}>
          {t('schemaNameLabel')}
        </label>
        <select
          id={`edit-field-mapping-schema-${fieldMappingId}`}
          required
          value={schemaName}
          onChange={(event) => setSchemaName(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {schemaChoices.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <FieldMappingRuleEditor rules={rules} onChange={setRules} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || name.trim().length === 0 || rules.length === 0}>
          {t('saveMapping')}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditMapping')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
