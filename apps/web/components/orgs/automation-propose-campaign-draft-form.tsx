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
  /** Only targets with no campaign created yet — a target already has one campaign for its lifetime (KAN-72/73). */
  targets: AutomationTargetView[];
}

type Platform = 'google_ads' | 'meta';

const META_OBJECTIVES = ['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT'] as const;
type MetaObjective = (typeof META_OBJECTIVES)[number];

const META_OBJECTIVE_OPTION_KEYS: Record<MetaObjective, string> = {
  OUTCOME_TRAFFIC: 'proposeDraftObjectiveTrafficOption',
  OUTCOME_LEADS: 'proposeDraftObjectiveLeadsOption',
  OUTCOME_SALES: 'proposeDraftObjectiveSalesOption',
  OUTCOME_AWARENESS: 'proposeDraftObjectiveAwarenessOption',
  OUTCOME_ENGAGEMENT: 'proposeDraftObjectiveEngagementOption',
};

function linesOf(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Proposes a KAN-72/KAN-73 `campaign_draft_create` action — a brand-new, always-paused campaign, either a Google Ads Search campaign (one ad group, one Responsive Search Ad, keywords/negatives) or a Meta campaign (one ad set, one link ad), chosen via the platform selector (defaults to Google Ads to preserve pre-KAN-73 behavior). */
export function AutomationProposeCampaignDraftForm({ orgId, projectId, targets }: AutomationProposeCampaignDraftFormProps): React.ReactElement | null {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [platform, setPlatform] = useState<Platform>('google_ads');
  const [campaignName, setCampaignName] = useState('');
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState('');

  // Google Ads fields.
  const [adGroupName, setAdGroupName] = useState('');
  const [finalUrl, setFinalUrl] = useState('');
  const [headlines, setHeadlines] = useState('');
  const [descriptions, setDescriptions] = useState('');
  const [keywords, setKeywords] = useState('');
  const [negativeKeywords, setNegativeKeywords] = useState('');

  // Meta fields.
  const [objective, setObjective] = useState<MetaObjective>('OUTCOME_TRAFFIC');
  const [adSetName, setAdSetName] = useState('');
  const [countries, setCountries] = useState('');
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('65');
  const [genderMale, setGenderMale] = useState(false);
  const [genderFemale, setGenderFemale] = useState(false);
  const [adName, setAdName] = useState('');
  const [primaryText, setPrimaryText] = useState('');
  const [metaHeadline, setMetaHeadline] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('proposeDraftNoTargetsNote')}</p>;
  }

  function resetSharedFields(): void {
    setCampaignName('');
    setDailyBudgetUsd('');
  }

  function resetGoogleAdsFields(): void {
    setAdGroupName('');
    setFinalUrl('');
    setHeadlines('');
    setDescriptions('');
    setKeywords('');
    setNegativeKeywords('');
  }

  function resetMetaFields(): void {
    setAdSetName('');
    setCountries('');
    setAgeMin('18');
    setAgeMax('65');
    setGenderMale(false);
    setGenderFemale(false);
    setAdName('');
    setPrimaryText('');
    setMetaHeadline('');
    setMetaDescription('');
    setLinkUrl('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsedBudget = Number(dailyBudgetUsd);
    if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) {
      setError(t('proposeDraftInvalidBudgetError'));
      return;
    }

    let draft: Record<string, unknown>;
    if (platform === 'meta') {
      const countryList = linesOf(countries);
      if (countryList.length === 0) {
        setError(t('proposeDraftInvalidCountriesError'));
        return;
      }
      const parsedAgeMin = Number(ageMin);
      const parsedAgeMax = Number(ageMax);
      if (
        !Number.isInteger(parsedAgeMin) ||
        !Number.isInteger(parsedAgeMax) ||
        parsedAgeMin < 13 ||
        parsedAgeMax > 65 ||
        parsedAgeMin > parsedAgeMax
      ) {
        setError(t('proposeDraftInvalidAgeRangeError'));
        return;
      }
      const genders: Array<'male' | 'female'> = [...(genderMale ? (['male'] as const) : []), ...(genderFemale ? (['female'] as const) : [])];

      draft = {
        platform: 'meta',
        campaignName,
        objective,
        dailyBudgetUsd: parsedBudget,
        adSets: [
          {
            name: adSetName,
            targeting: {
              countries: countryList,
              ageMin: parsedAgeMin,
              ageMax: parsedAgeMax,
              ...(genders.length > 0 ? { genders } : {}),
            },
            ad: {
              name: adName,
              creative: {
                primaryText,
                headline: metaHeadline,
                ...(metaDescription.trim().length > 0 ? { description: metaDescription } : {}),
                linkUrl,
              },
            },
          },
        ],
      };
    } else {
      draft = {
        platform: 'google_ads',
        campaignName,
        advertisingChannelType: 'SEARCH',
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
    }

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
      resetSharedFields();
      resetGoogleAdsFields();
      resetMetaFields();
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
          <label className="text-sm font-medium" htmlFor="draft-platform">
            {t('proposeDraftPlatformLabel')}
          </label>
          <select
            id="draft-platform"
            value={platform}
            onChange={(event) => setPlatform(event.target.value as Platform)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="google_ads">{t('proposeDraftPlatformGoogleAdsOption')}</option>
            <option value="meta">{t('proposeDraftPlatformMetaOption')}</option>
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
      </div>

      {platform === 'google_ads' ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
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
        </>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="draft-objective">
                {t('proposeDraftObjectiveLabel')}
              </label>
              <select
                id="draft-objective"
                value={objective}
                onChange={(event) => setObjective(event.target.value as MetaObjective)}
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              >
                {META_OBJECTIVES.map((option) => (
                  <option key={option} value={option}>
                    {t(META_OBJECTIVE_OPTION_KEYS[option])}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="draft-ad-set-name">
                {t('proposeDraftAdSetNameLabel')}
              </label>
              <Input id="draft-ad-set-name" value={adSetName} onChange={(event) => setAdSetName(event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="draft-age-min">
                {t('proposeDraftAgeMinLabel')}
              </label>
              <Input id="draft-age-min" type="number" min={13} max={65} value={ageMin} onChange={(event) => setAgeMin(event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="draft-age-max">
                {t('proposeDraftAgeMaxLabel')}
              </label>
              <Input id="draft-age-max" type="number" min={13} max={65} value={ageMax} onChange={(event) => setAgeMax(event.target.value)} required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('proposeDraftGendersLabel')}</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={genderMale} onChange={(event) => setGenderMale(event.target.checked)} />
                {t('proposeDraftGenderMaleOption')}
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={genderFemale} onChange={(event) => setGenderFemale(event.target.checked)} />
                {t('proposeDraftGenderFemaleOption')}
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="draft-countries">
              {t('proposeDraftCountriesLabel')}
            </label>
            <textarea
              id="draft-countries"
              rows={3}
              value={countries}
              onChange={(event) => setCountries(event.target.value)}
              className="rounded-md border border-input bg-background p-2 text-sm"
              placeholder={t('proposeDraftCountriesPlaceholder')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="draft-ad-name">
                {t('proposeDraftAdNameLabel')}
              </label>
              <Input id="draft-ad-name" value={adName} onChange={(event) => setAdName(event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="draft-link-url">
                {t('proposeDraftLinkUrlLabel')}
              </label>
              <Input id="draft-link-url" type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="draft-primary-text">
                {t('proposeDraftPrimaryTextLabel')}
              </label>
              <textarea
                id="draft-primary-text"
                rows={3}
                value={primaryText}
                onChange={(event) => setPrimaryText(event.target.value)}
                className="rounded-md border border-input bg-background p-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="draft-meta-headline">
                {t('proposeDraftMetaHeadlineLabel')}
              </label>
              <Input id="draft-meta-headline" value={metaHeadline} onChange={(event) => setMetaHeadline(event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="draft-meta-description">
                {t('proposeDraftMetaDescriptionLabel')}
              </label>
              <Input id="draft-meta-description" value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} />
            </div>
          </div>
        </>
      )}

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
