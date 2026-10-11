'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MappingCastType, MappingRuleTransform } from '@growthos/shared';
import { Button } from '@/components/ui/button';
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
 * mapping from sample payload; user confirms"). Collapsed by default, the same posture
 * `TestRunFieldMappingPanel` (KAN-54) establishes, and only usable once a kind + target schema are
 * chosen on the create form, since the suggester needs the schema's registered fields to propose
 * against.
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
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!schemaName}>
        {t('suggestMappings')}
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-input p-2">
      <textarea
        aria-label={t('suggestSamplePayloadLabel')}
        placeholder={t('samplePayloadPlaceholder')}
        value={samplePayload}
        onChange={(event) => setSamplePayload(event.target.value)}
        className="min-h-24 rounded-md border border-input bg-background p-2 font-mono text-xs"
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={handleSuggest} disabled={submitting || samplePayload.trim().length === 0}>
          {t('runSuggest')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('close')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {suggestions ? (
        suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noSuggestions')}</p>
        ) : (
          <div className="flex flex-col gap-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span>{t('suggestionsHeading', { count: suggestions.length })}</span>
              <Button type="button" variant="secondary" size="sm" onClick={applyAll}>
                {t('applyAllSuggestions')}
              </Button>
            </div>
            <ul className="flex flex-col gap-1">
              {suggestions.map((suggestion) => (
                <li key={suggestion.targetField} className="flex items-center justify-between gap-2 rounded-md border border-input px-2 py-1">
                  <span>
                    {t('suggestionSummary', {
                      targetField: suggestion.targetField,
                      sourcePath: suggestion.sourcePath,
                      confidence: Math.round(suggestion.confidence * 100),
                    })}
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => onApplySuggestions([suggestionToRuleRow(suggestion)])}>
                    {t('applySuggestion')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
