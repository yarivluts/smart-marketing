'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';

export interface AutomationProposeKeywordEditFormProps {
  orgId: string;
  projectId: string;
  /** Only targets with at least one ad group created (a `campaign_draft_create` action already executed) — see `AutomationTargetView.adGroupResourceNames`. */
  targets: AutomationTargetView[];
}

function linesOf(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Proposes a KAN-72 follow-up `keyword_edit` action — adds keywords/negative keywords to an ad group an earlier `campaign_draft_create` action already created ("post-creation keyword edits"). */
export function AutomationProposeKeywordEditForm({ orgId, projectId, targets }: AutomationProposeKeywordEditFormProps): React.ReactElement | null {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [adGroupResourceName, setAdGroupResourceName] = useState(targets[0]?.adGroupResourceNames?.[0] ?? '');
  const [keywords, setKeywords] = useState('');
  const [negativeKeywords, setNegativeKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('proposeKeywordEditNoTargetsNote')}</p>;
  }

  const selectedTarget = targets.find((target) => target.id === targetId) ?? targets[0];
  const adGroupOptions = selectedTarget.adGroupResourceNames ?? [];

  function handleTargetChange(nextTargetId: string): void {
    setTargetId(nextTargetId);
    const nextTarget = targets.find((target) => target.id === nextTargetId);
    setAdGroupResourceName(nextTarget?.adGroupResourceNames?.[0] ?? '');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const addKeywords = linesOf(keywords).map((text) => ({ text, matchType: 'PHRASE' as const }));
    const addNegativeKeywords = linesOf(negativeKeywords).map((text) => ({ text, matchType: 'BROAD' as const }));
    if (addKeywords.length === 0 && addNegativeKeywords.length === 0) {
      setError(t('proposeKeywordEditEmptyError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/keyword-edits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, adGroupResourceName, addKeywords, addNegativeKeywords }),
      });
      if (!response.ok) {
        setError(t('proposeKeywordEditError'));
        return;
      }
      setKeywords('');
      setNegativeKeywords('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="keyword-edit-target">
            {t('proposeKeywordEditTargetLabel')}
          </label>
          <select
            id="keyword-edit-target"
            value={selectedTarget.id}
            onChange={(event) => handleTargetChange(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="keyword-edit-ad-group">
            {t('proposeKeywordEditAdGroupLabel')}
          </label>
          <select
            id="keyword-edit-ad-group"
            value={adGroupResourceName}
            onChange={(event) => setAdGroupResourceName(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {adGroupOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="keyword-edit-keywords">
            {t('proposeKeywordEditAddKeywordsLabel')}
          </label>
          <textarea
            id="keyword-edit-keywords"
            rows={3}
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            className="rounded-md border border-input bg-background p-2 text-sm"
            placeholder={t('proposeKeywordEditAddKeywordsPlaceholder')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="keyword-edit-negative-keywords">
            {t('proposeKeywordEditAddNegativeKeywordsLabel')}
          </label>
          <textarea
            id="keyword-edit-negative-keywords"
            rows={3}
            value={negativeKeywords}
            onChange={(event) => setNegativeKeywords(event.target.value)}
            className="rounded-md border border-input bg-background p-2 text-sm"
            placeholder={t('proposeKeywordEditAddNegativeKeywordsPlaceholder')}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {t('proposeKeywordEditButton')}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
