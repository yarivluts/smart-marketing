'use client';

import { useTranslations } from 'next-intl';
import { MAPPING_CAST_TYPES, MAPPING_RULE_TRANSFORMS, type MappingCastType, type MappingRuleTransform } from '@growthos/shared';
import { PpButton, ppInputClass } from '@/components/pastel/primitives';
import { Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

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

/** The add/edit/remove rule-row builder for the create-field-mapping form (KAN-54). */
export function FieldMappingRuleEditor({ rules, onChange }: FieldMappingRuleEditorProps): React.ReactElement {
  const t = useTranslations('FieldMappings');

  function updateRule(index: number, patch: Partial<FieldMappingRuleRow>): void {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function removeRule(index: number): void {
    onChange(rules.filter((_, i) => i !== index));
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-pp-label-sm uppercase tracking-wider text-pp-outline font-bold">{t('rulesLabel')}</legend>
      {rules.map((rule, index) => (
        <div
          key={index}
          className="flex flex-wrap items-center gap-2 rounded-2xl bg-pp-surface-container-low/70 p-3 border border-pp-outline-variant/30"
        >
          <div className="flex-1 min-w-[200px]">
            <input
              aria-label={t('targetFieldPlaceholder')}
              placeholder={t('targetFieldPlaceholder')}
              value={rule.targetField}
              onChange={(event) => updateRule(index, { targetField: event.target.value })}
              className={cn(ppInputClass, 'text-xs font-mono py-2')}
            />
          </div>
          <div className="w-[140px]">
            <select
              aria-label={t('transformHeader')}
              value={rule.transform}
              onChange={(event) => updateRule(index, { transform: event.target.value as MappingRuleTransform })}
              className={cn(ppInputClass, 'text-xs py-2')}
            >
              {MAPPING_RULE_TRANSFORMS.map((transform) => (
                <option key={transform} value={transform}>
                  {transform}
                </option>
              ))}
            </select>
          </div>
          {rule.transform === 'rename' || rule.transform === 'cast' ? (
            <div className="flex-1 min-w-[200px]">
              <input
                aria-label={t('sourcePathPlaceholder')}
                placeholder={t('sourcePathPlaceholder')}
                value={rule.sourcePath}
                onChange={(event) => updateRule(index, { sourcePath: event.target.value })}
                className={cn(ppInputClass, 'text-xs font-mono py-2')}
              />
            </div>
          ) : null}
          {rule.transform === 'cast' ? (
            <div className="w-[120px]">
              <select
                aria-label={t('castTypeHeader')}
                value={rule.castType}
                onChange={(event) => updateRule(index, { castType: event.target.value as MappingCastType })}
                className={cn(ppInputClass, 'text-xs py-2')}
              >
                {MAPPING_CAST_TYPES.map((castType) => (
                  <option key={castType} value={castType}>
                    {castType}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {rule.transform === 'template' ? (
            <div className="flex-1 min-w-[200px]">
              <input
                aria-label={t('templatePlaceholder')}
                placeholder={t('templatePlaceholder')}
                value={rule.template}
                onChange={(event) => updateRule(index, { template: event.target.value })}
                className={cn(ppInputClass, 'text-xs font-mono py-2')}
              />
            </div>
          ) : null}
          {rule.transform === 'static' ? (
            <div className="flex-1 min-w-[160px]">
              <input
                aria-label={t('staticValuePlaceholder')}
                placeholder={t('staticValuePlaceholder')}
                value={rule.staticValue}
                onChange={(event) => updateRule(index, { staticValue: event.target.value })}
                className={cn(ppInputClass, 'text-xs font-mono py-2')}
              />
            </div>
          ) : null}
          <PpButton
            type="button"
            variant="ghost"
            size="sm"
            icon={Trash2}
            className="text-pp-error hover:bg-pp-error-container/40"
            onClick={() => removeRule(index)}
          >
            {t('removeRule')}
          </PpButton>
        </div>
      ))}
      <div>
        <PpButton
          type="button"
          variant="secondary"
          size="sm"
          icon={Plus}
          onClick={() => onChange([...rules, blankFieldMappingRuleRow()])}
        >
          {t('addRule')}
        </PpButton>
      </div>
    </fieldset>
  );
}
