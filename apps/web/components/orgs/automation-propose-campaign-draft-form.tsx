'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';

export interface AutomationProposeCampaignDraftFormProps {
  orgId: string;
  projectId: string;
  /** Only targets with no campaign created yet — a target already has one campaign for its lifetime (KAN-72). */
  targets: AutomationTargetView[];
}

function linesOf(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Proposes a KAN-72 `campaign_draft_create` action — a brand-new, always-paused Search campaign (one ad group, one Responsive Search Ad, keywords/negatives). */
export function AutomationProposeCampaignDraftForm({ orgId, projectId, targets }: AutomationProposeCampaignDraftFormProps): React.ReactElement | null {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [campaignName, setCampaignName] = useState('');
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState('');
  const [adGroupName, setAdGroupName] = useState('');
  const [finalUrl, setFinalUrl] = useState('');
  const [headlines, setHeadlines] = useState('');
  const [descriptions, setDescriptions] = useState('');
  const [keywords, setKeywords] = useState('');
  const [negativeKeywords, setNegativeKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('proposeDraftNoTargetsNote')}</p>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsedBudget = Number(dailyBudgetUsd);
    if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) {
      setError(t('proposeDraftInvalidBudgetError'));
      return;
    }

    const draft = {
      campaignName,
      advertisingChannelType: 'SEARCH' as const,
      dailyBudgetUsd: parsedBudget,
      adGroups: [
        {
          name: adGroupName,
          keywords: linesOf(keywords).map((text) => ({ text, matchType: 'PHRASE' as const })),
          negativeKeywords: linesOf(negativeKeywords).map((text) => ({ text, matchType: 'BROAD' as const })),
          responsiveSearchAd: {
            headlines: linesOf(headlines),
            descriptions: linesOf(descriptions),
            finalUrl,
          },
        },
      ],
    };

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/campaign-drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, draft }),
      });
      if (!response.ok) {
        setError(t('proposeDraftError'));
        return;
      }
      setCampaignName('');
      setDailyBudgetUsd('');
      setAdGroupName('');
      setFinalUrl('');
      setHeadlines('');
      setDescriptions('');
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
          <label className="text-sm font-medium" htmlFor="draft-target">
            {t('proposeDraftTargetLabel')}
          </label>
          <select
            id="draft-target"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
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
          <label className="text-sm font-medium" htmlFor="draft-campaign-name">
            {t('proposeDraftCampaignNameLabel')}
          </label>
          <Input id="draft-campaign-name" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="draft-budget">
            {t('proposeDraftBudgetLabel')}
          </label>
          <Input id="draft-budget" type="number" min={0} value={dailyBudgetUsd} onChange={(event) => setDailyBudgetUsd(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="draft-ad-group-name">
            {t('proposeDraftAdGroupNameLabel')}
          </label>
          <Input id="draft-ad-group-name" value={adGroupName} onChange={(event) => setAdGroupName(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="draft-final-url">
            {t('proposeDraftFinalUrlLabel')}
          </label>
          <Input id="draft-final-url" type="url" value={finalUrl} onChange={(event) => setFinalUrl(event.target.value)} required />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="draft-headlines">
            {t('proposeDraftHeadlinesLabel')}
          </label>
          <textarea
            id="draft-headlines"
            rows={4}
            value={headlines}
            onChange={(event) => setHeadlines(event.target.value)}
            className="rounded-md border border-input bg-background p-2 text-sm"
            placeholder={t('proposeDraftHeadlinesPlaceholder')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="draft-descriptions">
            {t('proposeDraftDescriptionsLabel')}
          </label>
          <textarea
            id="draft-descriptions"
            rows={4}
            value={descriptions}
            onChange={(event) => setDescriptions(event.target.value)}
            className="rounded-md border border-input bg-background p-2 text-sm"
            placeholder={t('proposeDraftDescriptionsPlaceholder')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="draft-keywords">
            {t('proposeDraftKeywordsLabel')}
          </label>
          <textarea
            id="draft-keywords"
            rows={3}
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            className="rounded-md border border-input bg-background p-2 text-sm"
            placeholder={t('proposeDraftKeywordsPlaceholder')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="draft-negative-keywords">
            {t('proposeDraftNegativeKeywordsLabel')}
          </label>
          <textarea
            id="draft-negative-keywords"
            rows={3}
            value={negativeKeywords}
            onChange={(event) => setNegativeKeywords(event.target.value)}
            className="rounded-md border border-input bg-background p-2 text-sm"
            placeholder={t('proposeDraftNegativeKeywordsPlaceholder')}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {t('proposeDraftButton')}
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
