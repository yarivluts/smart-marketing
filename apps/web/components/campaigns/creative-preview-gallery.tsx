'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Search } from 'lucide-react';
import { MetaAdPreviewCard } from './meta-ad-preview-card';
import { GoogleSearchAdPreviewCard } from './google-search-ad-preview-card';
import type { UnifiedCampaignItem } from '@/lib/orgs/ads-performance-synthesizer';
import type { ImportedAdView } from './campaign-creatives-panel';

export interface CreativePreviewGalleryProps {
  items: UnifiedCampaignItem[];
  className?: string;
}

interface CreativeCardItem {
  id: string;
  campaignName: string;
  platform: 'meta_ads' | 'google_ads' | 'simulated';
  type: 'meta' | 'google_search';
  metaAd?: ImportedAdView;
  googleAd?: {
    headlines: string[];
    descriptions: string[];
    finalUrl: string;
    keywords?: string[];
  };
}

export function CreativePreviewGallery({
  items,
  className = '',
}: CreativePreviewGalleryProps): React.ReactElement {
  const t = useTranslations('Campaigns');

  const [platformFilter, setPlatformFilter] = useState<'all' | 'meta_ads' | 'google_ads' | 'simulated'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract or synthesize creative cards from campaigns
  const creatives = useMemo(() => {
    const list: CreativeCardItem[] = [];

    for (const item of items) {
      let addedForCampaign = false;

      // 1. Check imported ads
      if (item.importedAds && item.importedAds.length > 0) {
        item.importedAds.forEach((ad, idx) => {
          list.push({
            id: `${item.id}-ad-${idx}`,
            campaignName: item.label,
            platform: item.platform,
            type: 'meta',
            metaAd: ad,
          });
          addedForCampaign = true;
        });
      }

      // 2. Check draft
      if (item.draft) {
        if (item.draft.platform === 'google_ads') {
          item.draft.adGroups.forEach((ag, idx) => {
            list.push({
              id: `${item.id}-draft-g-${idx}`,
              campaignName: item.label,
              platform: item.platform,
              type: 'google_search',
              googleAd: {
                headlines: ag.responsiveSearchAd.headlines,
                descriptions: ag.responsiveSearchAd.descriptions,
                finalUrl: ag.responsiveSearchAd.finalUrl,
                keywords: ag.keywords.map((k) => k.text),
              },
            });
            addedForCampaign = true;
          });
        } else if (item.draft.platform === 'meta') {
          item.draft.adSets.forEach((adSet, idx) => {
            list.push({
              id: `${item.id}-draft-m-${idx}`,
              campaignName: item.label,
              platform: item.platform,
              type: 'meta',
              metaAd: {
                adName: adSet.ad.name,
                headline: adSet.ad.creative.headline,
                primaryText: adSet.ad.creative.primaryText,
                description: adSet.ad.creative.description,
                linkUrl: adSet.ad.creative.linkUrl,
                callToActionType: 'LEARN_MORE',
                status: item.status === 'enabled' ? 'ACTIVE' : 'PAUSED',
              },
            });
            addedForCampaign = true;
          });
        }
      }

      // 3. If no explicit ads attached, synthesize a realistic preview based on campaign platform/label
      if (!addedForCampaign) {
        if (item.platform === 'google_ads') {
          list.push({
            id: `${item.id}-synth-google`,
            campaignName: item.label,
            platform: item.platform,
            type: 'google_search',
            googleAd: {
              headlines: [`${item.label} Official`, 'Smart Growth & ROI', 'Get Started Today'],
              descriptions: [
                `Accelerate your marketing performance with ${item.label}. High-converting campaigns tailored to your goals.`,
                'Join thousands of high-growth teams scaling with zero-friction operations.',
              ],
              finalUrl: 'https://growthos.io',
              keywords: ['growth marketing', 'marketing automation', 'campaign performance'],
            },
          });
        } else {
          list.push({
            id: `${item.id}-synth-meta`,
            campaignName: item.label,
            platform: item.platform,
            type: 'meta',
            metaAd: {
              adName: `${item.label} Creative A`,
              headline: `Discover ${item.label} — Scale Faster`,
              primaryText: `🚀 Maximize your growth velocity with ${item.label}. Automated optimizations, smart targeting, and real-time performance tracking.`,
              description: 'Zero-configuration growth marketing platform.',
              linkUrl: 'https://growthos.io',
              callToActionType: 'SIGN_UP',
              status: item.status === 'enabled' ? 'ACTIVE' : 'PAUSED',
            },
          });
        }
      }
    }

    return list;
  }, [items]);

  const filteredCreatives = useMemo(() => {
    return creatives.filter((c) => {
      const matchesPlatform = platformFilter === 'all' || c.platform === platformFilter;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        c.campaignName.toLowerCase().includes(query) ||
        c.metaAd?.headline?.toLowerCase().includes(query) ||
        c.metaAd?.primaryText?.toLowerCase().includes(query) ||
        c.googleAd?.headlines.some((h) => h.toLowerCase().includes(query)) ||
        c.googleAd?.keywords?.some((k) => k.toLowerCase().includes(query));

      return matchesPlatform && matchesSearch;
    });
  }, [creatives, platformFilter, searchQuery]);

  return (
    <div className={`flex flex-col gap-6 ${className}`} data-testid="creative-preview-gallery">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPlatformFilter('all')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              platformFilter === 'all'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {t('filterAllPlatforms')}
          </button>
          <button
            type="button"
            onClick={() => setPlatformFilter('meta_ads')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              platformFilter === 'meta_ads'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {t('filterMetaAds')}
          </button>
          <button
            type="button"
            onClick={() => setPlatformFilter('google_ads')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              platformFilter === 'google_ads'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {t('filterGoogleAds')}
          </button>
          <button
            type="button"
            onClick={() => setPlatformFilter('simulated')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              platformFilter === 'simulated'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {t('filterSimulated')}
          </button>
        </div>

        <div className="relative min-w-[240px]">
          <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="h-9 w-full rounded-xl border border-input bg-background ps-8 pe-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary shadow-2xs"
          />
        </div>
      </div>

      {/* Grid */}
      {filteredCreatives.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-2" aria-hidden="true" />
          <p className="text-sm font-medium">{t('noCreativesFound')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredCreatives.map((creative) => (
            <div key={creative.id} className="flex flex-col">
              {creative.type === 'meta' && creative.metaAd ? (
                <MetaAdPreviewCard
                  campaignName={creative.campaignName}
                  ad={creative.metaAd}
                />
              ) : creative.type === 'google_search' && creative.googleAd ? (
                <GoogleSearchAdPreviewCard
                  campaignName={creative.campaignName}
                  headlines={creative.googleAd.headlines}
                  descriptions={creative.googleAd.descriptions}
                  finalUrl={creative.googleAd.finalUrl}
                  keywords={creative.googleAd.keywords}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
