'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { Environment } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { PpButton, PpField, ppInputClass } from '@/components/pastel/primitives';
import { PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { blankFieldMappingRuleRow, FieldMappingRuleEditor, type FieldMappingRuleRow } from './field-mapping-rule-editor';
import { SuggestFieldMappingsPanel } from './suggest-field-mappings-panel';

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
  /** Every kind's currently-active registered schema names (KAN-31). */
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

  function applySuggestedRules(suggested: FieldMappingRuleRow[]): void {
    setRules((previousRules) => {
      const keptRows = previousRules.filter(
        (rule) =>
          rule.targetField.trim().length > 0 ||
          rule.sourcePath.trim().length > 0 ||
          rule.template.trim().length > 0 ||
          rule.staticValue.trim().length > 0,
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
        const body = (await response.json().catch(() => null)) as { error?: string; reasons?: string[] } | null;
        if (body?.error === 'target_schema_not_registered') {
          setError(t('targetSchemaNotRegisteredError'));
        } else if (body?.reasons?.length) {
          setError(body.reasons.join(' '));
        } else {
          setError(t('createError'));
        }
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
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <PpField label={t('nameLabel')} htmlFor="field-mapping-name">
        <input
          id="field-mapping-name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={ppInputClass}
          placeholder="e.g. Stripe checkout mapping"
        />
      </PpField>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PpField label={t('kindLabel')} htmlFor="field-mapping-kind">
          <select
            id="field-mapping-kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as FieldMappingKind);
              setSchemaName('');
            }}
            className={ppInputClass}
          >
            {FIELD_MAPPING_KINDS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </PpField>

        <PpField label={t('environmentLabel')} htmlFor="field-mapping-environment">
          <select
            id="field-mapping-environment"
            value={environmentId}
            onChange={(event) => setEnvironmentId(event.target.value)}
            className={ppInputClass}
          >
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {tEnv(environment.name)}
              </option>
            ))}
          </select>
        </PpField>

        <PpField label={t('schemaNameLabel')} htmlFor="field-mapping-schema-name">
          <select
            id="field-mapping-schema-name"
            required
            value={schemaName}
            onChange={(event) => setSchemaName(event.target.value)}
            className={ppInputClass}
          >
            <option value="">{t('schemaNamePlaceholder')}</option>
            {schemaOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </PpField>

        {hookEndpoints.length > 0 ? (
          <PpField label={t('hookEndpointLabel')} htmlFor="field-mapping-hook-endpoint">
            <select
              id="field-mapping-hook-endpoint"
              value={hookEndpointId}
              onChange={(event) => setHookEndpointId(event.target.value)}
              className={ppInputClass}
            >
              <option value="">{t('hookEndpointNone')}</option>
              {hookEndpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}
                </option>
              ))}
            </select>
          </PpField>
        ) : null}
      </div>

      <div className="pt-1">
        <SuggestFieldMappingsPanel
          orgId={orgId}
          projectId={projectId}
          kind={kind}
          schemaName={schemaName}
          onApplySuggestions={applySuggestedRules}
        />
      </div>

      <FieldMappingRuleEditor rules={rules} onChange={setRules} />

      {schemaOptions.length === 0 ? (
        <p className="text-xs text-pp-outline font-medium">{t('noActiveSchemasForKind')}</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-pp-error">
          {error}
        </p>
      ) : null}

      <div>
        <PpButton
          type="submit"
          variant="primary"
          icon={PlusCircle}
          disabled={submitting || rules.length === 0 || schemaOptions.length === 0 || environments.length === 0}
        >
          {t('create')}
        </PpButton>
      </div>
    </form>
  );
}
