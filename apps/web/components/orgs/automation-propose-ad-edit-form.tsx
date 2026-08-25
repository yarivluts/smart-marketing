'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';

export interface AutomationProposeAdEditFormProps {
  orgId: string;
  projectId: string;
  /** Only targets with at least one ad created (a `campaign_draft_create` action already executed) — see `AutomationTargetView.adResourceNames`. */
  targets: AutomationTargetView[];
}

function linesOf(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Proposes a KAN-72 follow-up `ad_edit` action — replaces an already-created ad group's Responsive Search Ad with revised headlines/descriptions/final URL ("post-creation ad edits"). */
export function AutomationProposeAdEditForm({ orgId, projectId, targets }: AutomationProposeAdEditFormProps): React.ReactElement | null {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [adResourceName, setAdResourceName] = useState(targets[0]?.adResourceNames?.[0] ?? '');
  const [headlines, setHeadlines] = useState('');
  const [descriptions, setDescriptions] = useState('');
  const [finalUrl, setFinalUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('proposeAdEditNoTargetsNote')}</p>;
  }

  const selectedTarget = targets.find((target) => target.id === targetId) ?? targets[0];
  const adOptions = selectedTarget.adResourceNames ?? [];

  function handleTargetChange(nextTargetId: string): void {
    setTargetId(nextTargetId);
    const nextTarget = targets.find((target) => target.id === nextTargetId);
    setAdResourceName(nextTarget?.adResourceNames?.[0] ?? '');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const headlineLines = linesOf(headlines);
    const descriptionLines = linesOf(descriptions);
    if (headlineLines.length === 0 || descriptionLines.length === 0 || finalUrl.trim().length === 0) {
      setError(t('proposeAdEditEmptyError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/ad-edits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId,
          previousAdResourceName: adResourceName,
          responsiveSearchAd: { headlines: headlineLines, descriptions: descriptionLines, finalUrl: finalUrl.trim() },
        }),
      });
      if (!response.ok) {
        setError(t('proposeAdEditError'));
        return;
      }
      setHeadlines('');
      setDescriptions('');
      setFinalUrl('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="ad-edit-target">
            {t('proposeAdEditTargetLabel')}
          </label>
          <select
            id="ad-edit-target"
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
          <label className="text-sm font-medium" htmlFor="ad-edit-ad">
            {t('proposeAdEditAdLabel')}
          </label>
          <select
            id="ad-edit-ad"
            value={adResourceName}
            onChange={(event) => setAdResourceName(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {adOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="ad-edit-headlines">
            {t('proposeAdEditHeadlinesLabel')}
          </label>
          <textarea
            id="ad-edit-headlines"
            rows={4}
            value={headlines}
            onChange={(event) => setHeadlines(event.target.value)}
            className="rounded-md border border-input bg-background p-2 text-sm"
            placeholder={t('proposeAdEditHeadlinesPlaceholder')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="ad-edit-descriptions">
            {t('proposeAdEditDescriptionsLabel')}
          </label>
          <textarea
            id="ad-edit-descriptions"
            rows={4}
            value={descriptions}
            onChange={(event) => setDescriptions(event.target.value)}
            className="rounded-md border border-input bg-background p-2 text-sm"
            placeholder={t('proposeAdEditDescriptionsPlaceholder')}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="ad-edit-final-url">
          {t('proposeAdEditFinalUrlLabel')}
        </label>
        <input
          id="ad-edit-final-url"
          type="text"
          value={finalUrl}
          onChange={(event) => setFinalUrl(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          placeholder={t('proposeAdEditFinalUrlPlaceholder')}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {t('proposeAdEditButton')}
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
