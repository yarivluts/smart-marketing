'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { Environment } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { blankFieldMappingRuleRow, FieldMappingRuleEditor, type FieldMappingRuleRow } from './field-mapping-rule-editor';
import { SuggestFieldMappingsPanel } from './suggest-field-mappings-panel';

// Client components must never import a *value* from `@growthos/firebase-orm-models` — see
// `create-hook-endpoint-form.tsx`'s own doc comment for why. `MappingRecordKind` and `SchemaDefKind`
// are the same three strings by design (`field-mapping.model.ts`'s doc comment), so this mirrors
// `register-schema-def-form.tsx`'s `SCHEMA_DEF_KINDS` local copy.
const FIELD_MAPPING_KINDS = ['event', 'entity', 'measure'] as const;
type FieldMappingKind = (typeof FIELD_MAPPING_KINDS)[number];

export interface FieldMappingEnvironmentOption {
  id: string;
  name: Environment;
}

export interface FieldMappingHookEndpointOption {
  id: string;
  name: string;
}

export interface CreateFieldMappingFormProps {
  orgId: string;
  projectId: string;
  environments: readonly FieldMappingEnvironmentOption[];
  hookEndpoints: readonly FieldMappingHookEndpointOption[];
  /** Every kind's currently-active registered schema names (KAN-31) — the mapping's `schemaName` must be one of these, so the picker only ever offers a valid target. */
  schemaNamesByKind: Readonly<Record<FieldMappingKind, readonly string[]>>;
}

/** Saves a new field mapping (KAN-54 AC: "saved field-mappings"). */
export function CreateFieldMappingForm({
  orgId,
  projectId,
  environments,
  hookEndpoints,
  schemaNamesByKind,
}: CreateFieldMappingFormProps): React.ReactElement {
  const t = useTranslations('FieldMappings');
  const tEnv = useTranslations('EnvBadge');
  const router = useRouter();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldMappingKind>('event');
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '');
  const [hookEndpointId, setHookEndpointId] = useState('');
  const [schemaName, setSchemaName] = useState('');
  const [rules, setRules] = useState<FieldMappingRuleRow[]>([blankFieldMappingRuleRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schemaOptions = schemaNamesByKind[kind] ?? [];

  /**
   * Merges suggested rules into the rule list without clobbering rows the user already filled in
   * for the same target field — the suggestion panel's own "user confirms" step is this merge plus
   * the normal rule editor, not a direct save. A row counts as "already in use" by *any* typed
   * content, not just a non-empty `targetField` — a row where the user has only typed a
   * `sourcePath` so far (hasn't named the target field yet) must survive, not be silently dropped
   * just because a suggestion happened to be applied elsewhere on the form.
   */
  function applySuggestedRules(suggested: FieldMappingRuleRow[]): void {
    setRules((previousRules) => {
      const keptRows = previousRules.filter(
        (rule) => rule.targetField.trim().length > 0 || rule.sourcePath.trim().length > 0 || rule.template.trim().length > 0 || rule.staticValue.trim().length > 0,
      );
      const existingTargets = new Set(
        keptRows.filter((rule) => rule.targetField.trim().length > 0).map((rule) => rule.targetField.trim()),
      );
      const newRows = suggested.filter((rule) => !existingTargets.has(rule.targetField.trim()));
      const merged = [...keptRows, ...newRows];
      return merged.length > 0 ? merged : [blankFieldMappingRuleRow()];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/field-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          kind,
          environmentId,
          hookEndpointId: hookEndpointId || undefined,
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
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error === 'target_schema_not_registered' ? t('targetSchemaNotRegisteredError') : t('createError'));
        return;
      }
      setName('');
      setSchemaName('');
      setRules([blankFieldMappingRuleRow()]);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="field-mapping-name">
          {t('nameLabel')}
        </label>
        <Input id="field-mapping-name" required value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="field-mapping-kind">
            {t('kindLabel')}
          </label>
          <select
            id="field-mapping-kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as FieldMappingKind);
              setSchemaName('');
            }}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {FIELD_MAPPING_KINDS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="field-mapping-environment">
            {t('environmentLabel')}
          </label>
          <select
            id="field-mapping-environment"
            value={environmentId}
            onChange={(event) => setEnvironmentId(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {tEnv(environment.name)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="field-mapping-schema-name">
            {t('schemaNameLabel')}
          </label>
          <select
            id="field-mapping-schema-name"
            required
            value={schemaName}
            onChange={(event) => setSchemaName(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">{t('schemaNamePlaceholder')}</option>
            {schemaOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {hookEndpoints.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="field-mapping-hook-endpoint">
              {t('hookEndpointLabel')}
            </label>
            <select
              id="field-mapping-hook-endpoint"
              value={hookEndpointId}
              onChange={(event) => setHookEndpointId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{t('hookEndpointNone')}</option>
              {hookEndpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <SuggestFieldMappingsPanel orgId={orgId} projectId={projectId} kind={kind} schemaName={schemaName} onApplySuggestions={applySuggestedRules} />

      <FieldMappingRuleEditor rules={rules} onChange={setRules} />

      {schemaOptions.length === 0 ? <p className="text-xs text-muted-foreground">{t('noActiveSchemasForKind')}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || rules.length === 0 || schemaOptions.length === 0 || environments.length === 0}>
        {t('create')}
      </Button>
    </form>
  );
}
