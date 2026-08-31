'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
    ad: {
      name: string;
      creative: {
        primaryText: string;
        headline: string;
        description?: string;
        linkUrl: string;
      };
    };
  }[];
}

export type CampaignDraftView = GoogleAdsCampaignDraftView | MetaCampaignDraftView;

export interface ImportedAdView {
  adSetName?: string;
  adName: string;
  status?: string;
  headline?: string;
  primaryText?: string;
  description?: string;
  linkUrl?: string;
  imageUrl?: string;
  callToActionType?: string;
}

export interface CampaignCreativesPanelProps {
  draft: CampaignDraftView | undefined;
  importedAds?: ImportedAdView[];
  className?: string;
}

export function CampaignCreativesPanel({
  draft,
  importedAds,
  className = '',
}: CampaignCreativesPanelProps): React.ReactElement {
  const t = useTranslations('Campaigns');

  if (importedAds && importedAds.length > 0) {
    return (
      <ul className={`flex flex-col gap-4 ${className}`}>
        {importedAds.map((ad, index) => (
          <li
            key={`${index}-${ad.adName}`}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs transition-all hover:shadow-md"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
              <span className="font-bold text-sm text-foreground" dir="auto">
                {ad.adName}
              </span>
              <div className="flex items-center gap-2">
                {ad.adSetName ? (
                  <Badge variant="secondary" size="sm">
                    <span dir="auto">{ad.adSetName}</span>
                  </Badge>
                ) : null}
                {ad.status ? (
                  <Badge
                    variant={ad.status === 'ACTIVE' || ad.status === 'enabled' ? 'success' : 'secondary'}
                    size="sm"
                    className="uppercase font-semibold text-[10px]"
                  >
                    {ad.status}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 rounded-xl bg-muted/30 p-4">
              {ad.imageUrl ? (
                <img
                  src={ad.imageUrl}
                  alt={ad.headline ?? ad.adName}
                  className="h-28 w-28 shrink-0 rounded-xl border border-border/60 object-cover shadow-2xs"
                />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {ad.headline ? (
                  <span className="font-bold text-foreground text-sm leading-snug" dir="auto">
                    {ad.headline}
                  </span>
                ) : null}
                {ad.primaryText ? (
                  <span className="text-xs text-foreground/90 leading-relaxed" dir="auto">
                    {ad.primaryText}
                  </span>
                ) : null}
                {ad.description ? (
                  <span className="text-xs text-muted-foreground" dir="auto">
                    {ad.description}
                  </span>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border/40 pt-2 text-xs">
                  {ad.linkUrl ? (
                    <span className="truncate font-mono text-[11px] text-muted-foreground" dir="ltr">
                      {ad.linkUrl}
                    </span>
                  ) : null}
                  {ad.callToActionType ? (
                    <span className="font-semibold text-primary" dir="ltr">
                      {t('importedAdCta', { cta: ad.callToActionType })}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (!draft) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
        <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-2" aria-hidden="true" />
        <p className="text-sm font-medium">{t('noCreativesYet')}</p>
      </div>
    );
  }

  if (draft.platform === 'meta') {
    return (
      <ul className={`flex flex-col gap-4 ${className}`}>
        {draft.adSets.map((adSet) => (
          <li
            key={adSet.name}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
              <span className="font-bold text-sm text-foreground">{adSet.name}</span>
              <Badge variant="secondary" size="sm">
                {t('metaTargetingSummary', {
                  countries: adSet.targeting.countries.join(', '),
                  ageMin: adSet.targeting.ageMin,
                  ageMax: adSet.targeting.ageMax,
                })}
              </Badge>
            </div>
            <div className="flex flex-col gap-1.5 rounded-xl bg-muted/30 p-4">
              <span className="font-bold text-foreground text-sm">{adSet.ad.creative.headline}</span>
              <span className="text-xs text-foreground/90 leading-relaxed" dir="auto">
                {adSet.ad.creative.primaryText}
              </span>
              {adSet.ad.creative.description ? (
                <span className="text-xs text-muted-foreground" dir="auto">
                  {adSet.ad.creative.description}
                </span>
              ) : null}
              <span className="mt-1 truncate font-mono text-[11px] text-muted-foreground" dir="ltr">
                {adSet.ad.creative.linkUrl}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={`flex flex-col gap-4 ${className}`}>
      {draft.adGroups.map((adGroup) => (
        <li
          key={adGroup.name}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs"
        >
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <span className="font-bold text-sm text-foreground">{adGroup.name}</span>
            <Badge variant="info" size="sm">
              {'Google RSA'}
            </Badge>
          </div>
          <div className="flex flex-col gap-2 rounded-xl bg-muted/30 p-4">
            <div className="flex flex-wrap gap-1.5">
              {adGroup.responsiveSearchAd.headlines.map((headline) => (
                <span
                  key={headline}
                  className="rounded-md bg-card border border-border/60 px-2 py-0.5 text-xs font-semibold text-foreground shadow-2xs"
                >
                  {headline}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {adGroup.responsiveSearchAd.descriptions.map((description) => (
                <p key={description}>{description}</p>
              ))}
            </div>
            <span className="mt-1 font-mono text-[11px] text-muted-foreground" dir="ltr">
              {adGroup.responsiveSearchAd.finalUrl}
            </span>
          </div>
          {adGroup.keywords.length > 0 ? (
            <div className="text-xs text-muted-foreground">
              {t('keywordsLine', {
                keywords: adGroup.keywords.map((keyword) => keyword.text).join(', '),
              })}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
