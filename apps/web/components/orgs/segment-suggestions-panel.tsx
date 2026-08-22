'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SegmentSuggestion } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export interface SegmentSuggestionsPanelProps {
  orgId: string;
  projectId: string;
  suggestions: SegmentSuggestion[];
}

function suggestionKey(suggestion: SegmentSuggestion): string {
  return `${suggestion.schemaName}|${suggestion.field}`;
}

/**
 * AI-suggested high-value lists (KAN-81, plan `14 §Gap 5`: "AI proposes new high-value lists") — each
 * row is a deterministic-heuristic proposal (`suggestSegmentsForProject`, `@growthos/shared`'s
 * `proposeSegmentSuggestions`), never auto-saved. Accepting a suggestion posts through the exact same
 * `POST .../segments` route `CreateSegmentForm` uses, so there is exactly one segment-creation path;
 * `router.refresh()` re-fetches both the segments list and this panel's own suggestions, which
 * naturally drops the accepted row (`suggestSegmentsForProject` excludes any suggestion whose filter
 * already exists on a saved segment).
 */
export function SegmentSuggestionsPanel({ orgId, projectId, suggestions }: SegmentSuggestionsPanelProps): React.ReactElement | null {
  const t = useTranslations('Segments');
  const tCategory = useTranslations('Segments.suggestionCategory');
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  if (suggestions.length === 0) {
    return null;
  }

  async function handleCreate(suggestion: SegmentSuggestion): Promise<void> {
    const key = suggestionKey(suggestion);
    setErrorKey(null);
    setPendingKey(key);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/segments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${tCategory(suggestion.category)} (${suggestion.schemaName}.${suggestion.field})`,
          schemaName: suggestion.schemaName,
          filters: suggestion.filters,
        }),
      });
      if (!response.ok) {
        setErrorKey(key);
        return;
      }
      router.refresh();
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('suggestionsHeading')}</h2>
      <p className="text-xs text-muted-foreground">{t('suggestionsIntro')}</p>
      <ul className="flex flex-col gap-2">
        {suggestions.map((suggestion) => {
          const key = suggestionKey(suggestion);
          return (
            <li key={key} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{tCategory(suggestion.category)}</span>
                <Button type="button" size="sm" disabled={pendingKey === key} onClick={() => handleCreate(suggestion)}>
                  {t('suggestionCreateButton')}
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">{t('suggestionFieldLabel', { schemaName: suggestion.schemaName, field: suggestion.field })}</span>
              {errorKey === key ? (
                <p role="alert" className="text-sm text-destructive">
                  {t('suggestionCreateError')}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
