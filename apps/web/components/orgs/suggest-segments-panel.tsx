'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SegmentEventConditionKind, SegmentFilterOperator } from '@growthos/shared';
import { Button } from '@/components/ui/button';
import type { EventConditionRow, FilterRow } from './create-segment-form';

interface SegmentSuggestionEventCondition {
  kind: SegmentEventConditionKind;
  schemaName: string;
  filters?: Array<{ field: string; op: SegmentFilterOperator; value: string | number | boolean }>;
  withinDays?: number;
}

interface SegmentSuggestion {
  name: string;
  filters: Array<{ field: string; op: SegmentFilterOperator; value: string | number | boolean }>;
  confidence: number;
  /** KAN-103 — carried through for a curated cross-schema suggestion (e.g. the plan's own "paying, no demo" example); absent for every plain field-heuristic suggestion. */
  eventConditions?: SegmentSuggestionEventCondition[];
}

interface SuggestResponseBody {
  suggestions: SegmentSuggestion[];
}

export interface SuggestSegmentsPanelProps {
  orgId: string;
  projectId: string;
  schemaName: string;
  /** Applies a suggestion's name + filters (+ optional cross-schema event conditions, KAN-103) into the create-form's own state — nothing is saved directly from here, so the user still edits/removes rows and submits the form themselves (KAN-81 AC: "user confirms", the same posture `SuggestFieldMappingsPanel` (KAN-55) establishes). */
  onApplySuggestion: (suggestion: { name: string; filters: FilterRow[]; eventConditions?: EventConditionRow[] }) => void;
}

function suggestionToFilterRows(suggestion: SegmentSuggestion): FilterRow[] {
  return suggestion.filters.map((filter) => ({ field: filter.field, op: filter.op, value: String(filter.value) }));
}

function suggestionToEventConditionRows(eventConditions: SegmentSuggestionEventCondition[]): EventConditionRow[] {
  return eventConditions.map((condition) => ({
    kind: condition.kind,
    schemaName: condition.schemaName,
    withinDays: condition.withinDays !== undefined ? String(condition.withinDays) : '',
    filters: (condition.filters ?? []).map((filter) => ({ field: filter.field, op: filter.op, value: String(filter.value) })),
  }));
}

/**
 * Proposes candidate segment definitions for the currently-chosen entity
 * schema (KAN-81, E14.x, plan `14 §Gap 9` "AI-suggested lists"). Collapsed
 * by default, the same posture `SuggestFieldMappingsPanel` (KAN-55)
 * establishes, and only usable once a schema is chosen on the create form,
 * since the suggester needs the schema's registered fields to propose
 * against. Unlike a field-mapping suggestion (one row per target field),
 * a segment suggestion is already a complete, ready-to-review definition —
 * so there's one "use this" action per suggestion, not a per-row apply.
 */
export function SuggestSegmentsPanel({ orgId, projectId, schemaName, onApplySuggestion }: SuggestSegmentsPanelProps): React.ReactElement {
  const t = useTranslations('Segments');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SegmentSuggestion[] | null>(null);

  async function handleSuggest(): Promise<void> {
    setError(null);
    setSuggestions(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/segments/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaName }),
      });
      if (!response.ok) {
        setError(t('suggestSegmentsError'));
        return;
      }
      const body = (await response.json()) as SuggestResponseBody;
      setSuggestions(body.suggestions);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!schemaName}>
        {t('suggestSegmentsButton')}
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-input p-2">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={handleSuggest} disabled={submitting}>
          {t('runSuggestSegments')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('suggestSegmentsClose')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {suggestions ? (
        suggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noSegmentSuggestions')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {suggestions.map((suggestion) => (
              <li key={suggestion.name} className="flex items-center justify-between gap-2 rounded-md border border-input px-2 py-1">
                <span>{t('segmentSuggestionSummary', { name: suggestion.name, confidence: Math.round(suggestion.confidence * 100) })}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onApplySuggestion({
                      name: suggestion.name,
                      filters: suggestionToFilterRows(suggestion),
                      ...(suggestion.eventConditions ? { eventConditions: suggestionToEventConditionRows(suggestion.eventConditions) } : {}),
                    })
                  }
                >
                  {t('useSuggestionButton')}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
