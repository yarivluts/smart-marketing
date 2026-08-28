'use client';

import { useTranslations } from 'next-intl';

// Client components must never import from `@growthos/firebase-orm-models`
// (its barrel drags in server-only code — see metric-definition-editor.tsx's
// identical note), so this mirrors the server's `CampaignDraft` union as a
// plain view shape; the server page hands the draft over as plain JSON.
export interface GoogleAdsCampaignDraftView {
  platform: 'google_ads';
  campaignName: string;
  dailyBudgetUsd: number;
  adGroups: {
    name: string;
    keywords: { text: string }[];
    responsiveSearchAd: { headlines: string[]; descriptions: string[]; finalUrl: string };
  }[];
}

export interface MetaCampaignDraftView {
  platform: 'meta';
  campaignName: string;
  dailyBudgetUsd: number;
  adSets: {
    name: string;
    targeting: { countries: string[]; ageMin: number; ageMax: number };
    ad: { name: string; creative: { primaryText: string; headline: string; description?: string; linkUrl: string } };
  }[];
}

export type CampaignDraftView = GoogleAdsCampaignDraftView | MetaCampaignDraftView;

export interface CampaignCreativesPanelProps {
  draft: CampaignDraftView | undefined;
}

/**
 * The campaign's actual ads, rendered from its one `campaign_draft_create`
 * action's draft (see `findCampaignDraftForTarget` — creatives are derived,
 * never stored on the target row). Branches on the draft's `platform`
 * discriminant: Google ad groups carry RSAs (headlines/descriptions/final
 * URL/keywords); Meta ad sets carry a single link-ad creative + audience
 * targeting.
 */
export function CampaignCreativesPanel({ draft }: CampaignCreativesPanelProps): React.ReactElement {
  const t = useTranslations('Campaigns');

  if (!draft) {
    return <p className="text-sm text-muted-foreground">{t('noCreativesYet')}</p>;
  }

  if (draft.platform === 'meta') {
    return (
      <ul className="flex flex-col gap-3">
        {draft.adSets.map((adSet) => (
          <li key={adSet.name} className="flex flex-col gap-2 rounded-md border border-input p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{adSet.name}</span>
              <span className="text-xs text-muted-foreground">
                {t('metaTargetingSummary', {
                  countries: adSet.targeting.countries.join(', '),
                  ageMin: adSet.targeting.ageMin,
                  ageMax: adSet.targeting.ageMax,
                })}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-3">
              <span className="font-medium">{adSet.ad.creative.headline}</span>
              <span dir="auto">{adSet.ad.creative.primaryText}</span>
              {adSet.ad.creative.description ? <span className="text-muted-foreground">{adSet.ad.creative.description}</span> : null}
              <span className="text-xs text-muted-foreground" dir="ltr">
                {adSet.ad.creative.linkUrl}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {draft.adGroups.map((adGroup) => (
        <li key={adGroup.name} className="flex flex-col gap-2 rounded-md border border-input p-3 text-sm">
          <span className="font-medium">{adGroup.name}</span>
          <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-3">
            <div className="flex flex-wrap gap-1">
              {adGroup.responsiveSearchAd.headlines.map((headline) => (
                <span key={headline} className="rounded bg-background px-1.5 py-0.5 font-medium">
                  {headline}
                </span>
              ))}
            </div>
            {adGroup.responsiveSearchAd.descriptions.map((description) => (
              <span key={description} className="text-muted-foreground">
                {description}
              </span>
            ))}
            <span className="text-xs text-muted-foreground" dir="ltr">
              {adGroup.responsiveSearchAd.finalUrl}
            </span>
          </div>
          {adGroup.keywords.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {t('keywordsLine', { keywords: adGroup.keywords.map((keyword) => keyword.text).join(', ') })}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
