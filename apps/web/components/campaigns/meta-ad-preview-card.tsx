'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Megaphone, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ImportedAdView } from './campaign-creatives-panel';

export interface MetaAdPreviewCardProps {
  campaignName: string;
  ad: ImportedAdView;
  className?: string;
}

function parseHostname(linkUrl?: string): string {
  if (!linkUrl) return 'growthos.io';
  try {
    const url = new URL(linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`);
    return url.hostname;
  } catch {
    return linkUrl;
  }
}

export function MetaAdPreviewCard({
  campaignName,
  ad,
  className = '',
}: MetaAdPreviewCardProps): React.ReactElement {
  const t = useTranslations('Campaigns');
  const hostname = parseHostname(ad.linkUrl);
  const initials = campaignName.trim().slice(0, 2).toUpperCase() || 'AD';

  const ctaKey = ad.callToActionType ? ad.callToActionType.toLowerCase() : 'learn_more';
  const ctaLabel = t(`cta.${ctaKey}`, {
    defaultMessage: ad.callToActionType?.replace(/_/g, ' ') || 'Learn More',
  });

  const isActive = ad.status === 'ACTIVE' || ad.status === 'enabled';

  return (
    <div
      data-testid="meta-ad-preview-card"
      className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all duration-200 hover:shadow-md ${className}`}
    >
      {/* Sponsor Header */}
      <div className="flex items-center justify-between border-b border-border/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-xs font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            {initials}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-bold leading-tight text-foreground">
                {campaignName}
              </span>
              <span className="inline-flex items-center rounded-xs bg-blue-50 px-1 py-0.2 text-[9px] font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                {'Meta'}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">{t('metaSponsoredLabel')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ad.status ? (
            <Badge
              variant={isActive ? 'success' : 'secondary'}
              size="sm"
              className="uppercase font-semibold text-[10px]"
            >
              {ad.status}
            </Badge>
          ) : null}
          <button
            type="button"
            aria-label="Ad options"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Primary Copy */}
      {ad.primaryText ? (
        <div
          className="p-4 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap"
          dir="auto"
        >
          {ad.primaryText}
        </div>
      ) : null}

      {/* Visual Asset Container */}
      <div className="relative aspect-video w-full overflow-hidden border-y border-border/40 bg-muted/20 flex items-center justify-center">
        {ad.imageUrl ? (
          <img
            src={ad.imageUrl}
            alt={ad.headline ?? ad.adName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 p-6 text-center text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Megaphone className="h-6 w-6" aria-hidden="true" />
            </div>
            <span className="text-xs font-semibold text-foreground/80">
              {t('metaAdVisualPreviewPlaceholder')}
            </span>
          </div>
        )}
      </div>

      {/* Link & Headline Bar */}
      <div className="flex items-center justify-between gap-3 bg-muted/30 p-4">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="truncate text-[10px] uppercase font-bold tracking-wider text-muted-foreground" dir="ltr">
            {hostname}
          </span>
          {ad.headline ? (
            <span className="line-clamp-1 text-xs font-bold leading-snug text-foreground mt-0.5" dir="auto">
              {ad.headline}
            </span>
          ) : null}
          {ad.description ? (
            <span className="line-clamp-1 text-[11px] text-muted-foreground mt-0.5" dir="auto">
              {ad.description}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="shrink-0 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
