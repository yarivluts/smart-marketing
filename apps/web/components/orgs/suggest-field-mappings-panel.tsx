'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MappingCastType, MappingRuleTransform } from '@growthos/shared';
import { PpButton, ppInputClass } from '@/components/pastel/primitives';
import { Sparkles, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldMappingRuleRow } from './field-mapping-rule-editor';

interface FieldMappingSuggestion {
  targetField: string;
  transform: MappingRuleTransform;
  sourcePath: string;
  castType?: MappingCastType;
  confidence: number;
}

interface SuggestResponseBody {
  suggestions: FieldMappingSuggestion[];
}

export interface SuggestFieldMappingsPanelProps {
  orgId: string;
  projectId: string;
  kind: string;
  schemaName: string;
  /** Merges the chosen suggestion(s) into the create-form's own rule rows — nothing is saved directly from here, so the user still edits/removes rows and submits the form themselves (KAN-55 AC: "user confirms"). */
  onApplySuggestions: (rows: FieldMappingRuleRow[]) => void;
}

function suggestionToRuleRow(suggestion: FieldMappingSuggestion): FieldMappingRuleRow {
  return {
    targetField: suggestion.targetField,
    transform: suggestion.transform,
    sourcePath: suggestion.sourcePath,
    castType: suggestion.castType ?? 'string',
    template: '',
    staticValue: '',
  };
}

/**
 * Proposes field-mapping rules from a pasted sample payload (KAN-55 AC: "LLM proposes field
 * mapping from sample payload; user confirms"). Collapsed by default.
 */
export function SuggestFieldMappingsPanel({ orgId, projectId, kind, schemaName, onApplySuggestions }: SuggestFieldMappingsPanelProps): React.ReactElement {
  const t = useTranslations('FieldMappings');
  const [open, setOpen] = useState(false);
  const [samplePayload, setSamplePayload] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<FieldMappingSuggestion[] | null>(null);

  async function handleSuggest(): Promise<void> {
    setError(null);
    setSuggestions(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/field-mappings/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, schemaName, samplePayload }),
      });
      if (!response.ok) {
        setError(t('suggestError'));
        return;
      }
      const body = (await response.json()) as SuggestResponseBody;
      setSuggestions(body.suggestions);
    } finally {
      setSubmitting(false);
    }
  }

  function applyAll(): void {
    if (suggestions) {
      onApplySuggestions(suggestions.map(suggestionToRuleRow));
    }
  }

  if (!open) {
    return (
      <PpButton
        type="button"
        variant="secondary"
        size="sm"
        icon={Sparkles}
        onClick={() => setOpen(true)}
        disabled={!schemaName}
      >
        {t('suggestMappings')}
      </PpButton>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl bg-pp-surface-container-low/80 p-4 border border-pp-outline-variant/30">
      <textarea
        aria-label={t('suggestSamplePayloadLabel')}
        placeholder={t('samplePayloadPlaceholder')}
        value={samplePayload}
        onChange={(event) => setSamplePayload(event.target.value)}
        className={cn(ppInputClass, 'min-h-24 p-3 font-mono text-xs')}
      />
      <div className="flex items-center gap-2">
        <PpButton
          type="button"
          size="sm"
          icon={Sparkles}
          onClick={handleSuggest}
          disabled={submitting || samplePayload.trim().length === 0}
        >
          {t('runSuggest')}
        </PpButton>
        <PpButton type="button" variant="ghost" size="sm" icon={X} onClick={() => setOpen(false)}>
          {t('close')}
        </PpButton>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-pp-error font-medium">
          {error}
        </p>
      ) : null}
      {suggestions ? (
        suggestions.length === 0 ? (
          <p className="text-xs text-pp-on-surface-variant">{t('noSuggestions')}</p>
        ) : (
          <div className="flex flex-col gap-2 pt-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-pp-display text-pp-label-md font-bold text-pp-on-surface">
                {t('suggestionsHeading', { count: suggestions.length })}
              </span>
              <PpButton type="button" variant="secondary" size="sm" icon={Check} onClick={applyAll}>
                {t('applyAllSuggestions')}
              </PpButton>
            </div>
            <ul className="flex flex-col gap-2">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.targetField}
                  className="flex items-center justify-between gap-2 rounded-xl bg-pp-surface-container-lowest px-3 py-2 shadow-sm border border-pp-outline-variant/20"
                >
                  <span className="font-mono text-xs text-pp-on-surface">
                    {t('suggestionSummary', {
                      targetField: suggestion.targetField,
                      sourcePath: suggestion.sourcePath,
                      confidence: Math.round(suggestion.confidence * 100),
                    })}
                  </span>
                  <PpButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onApplySuggestions([suggestionToRuleRow(suggestion)])}
                  >
                    {t('applySuggestion')}
                  </PpButton>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
