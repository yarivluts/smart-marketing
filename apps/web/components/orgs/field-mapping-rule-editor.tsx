'use client';

import { useTranslations } from 'next-intl';
import { MAPPING_CAST_TYPES, MAPPING_RULE_TRANSFORMS, type MappingCastType, type MappingRuleTransform } from '@growthos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface FieldMappingRuleRow {
  targetField: string;
  transform: MappingRuleTransform;
  sourcePath: string;
  castType: MappingCastType;
  template: string;
  staticValue: string;
}

export function blankFieldMappingRuleRow(): FieldMappingRuleRow {
  return { targetField: '', transform: 'rename', sourcePath: '', castType: 'string', template: '', staticValue: '' };
}

export interface FieldMappingRuleEditorProps {
  rules: FieldMappingRuleRow[];
  onChange: (rules: FieldMappingRuleRow[]) => void;
}

/** The add/edit/remove rule-row builder for the create-field-mapping form (KAN-54). Only shows the input(s) relevant to a row's own `transform` — a `sourcePath` for rename/cast, a `castType` picker for cast, a `template` field for template, a `staticValue` field for static. */
export function FieldMappingRuleEditor({ rules, onChange }: FieldMappingRuleEditorProps): React.ReactElement {
  const t = useTranslations('FieldMappings');

  function updateRule(index: number, patch: Partial<FieldMappingRuleRow>): void {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function removeRule(index: number): void {
    onChange(rules.filter((_, i) => i !== index));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t('rulesLabel')}</legend>
      {rules.map((rule, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-input p-2">
          <Input
            aria-label={t('targetFieldPlaceholder')}
            placeholder={t('targetFieldPlaceholder')}
            value={rule.targetField}
            onChange={(event) => updateRule(index, { targetField: event.target.value })}
          />
          <select
            aria-label={t('transformHeader')}
            value={rule.transform}
            onChange={(event) => updateRule(index, { transform: event.target.value as MappingRuleTransform })}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {MAPPING_RULE_TRANSFORMS.map((transform) => (
              <option key={transform} value={transform}>
                {transform}
              </option>
            ))}
          </select>
          {rule.transform === 'rename' || rule.transform === 'cast' ? (
            <Input
              aria-label={t('sourcePathPlaceholder')}
              placeholder={t('sourcePathPlaceholder')}
              value={rule.sourcePath}
              onChange={(event) => updateRule(index, { sourcePath: event.target.value })}
            />
          ) : null}
          {rule.transform === 'cast' ? (
            <select
              aria-label={t('castTypeHeader')}
              value={rule.castType}
              onChange={(event) => updateRule(index, { castType: event.target.value as MappingCastType })}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              {MAPPING_CAST_TYPES.map((castType) => (
                <option key={castType} value={castType}>
                  {castType}
                </option>
              ))}
            </select>
          ) : null}
          {rule.transform === 'template' ? (
            <Input
              aria-label={t('templatePlaceholder')}
              placeholder={t('templatePlaceholder')}
              value={rule.template}
              onChange={(event) => updateRule(index, { template: event.target.value })}
            />
          ) : null}
          {rule.transform === 'static' ? (
            <Input
              aria-label={t('staticValuePlaceholder')}
              placeholder={t('staticValuePlaceholder')}
              value={rule.staticValue}
              onChange={(event) => updateRule(index, { staticValue: event.target.value })}
            />
          ) : null}
          <Button type="button" variant="destructive" size="sm" onClick={() => removeRule(index)}>
            {t('removeRule')}
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rules, blankFieldMappingRuleRow()])}>
        {t('addRule')}
      </Button>
    </fieldset>
  );
}
