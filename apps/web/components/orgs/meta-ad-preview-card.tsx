'use client';

import { useTranslations } from 'next-intl';
import { Megaphone, MoreHorizontal } from 'lucide-react';
import type { ImportedAdView } from './campaign-creatives-panel';

export interface MetaAdPreviewCardProps {
  campaignName: string;
  ad: ImportedAdView;
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

export function MetaAdPreviewCard({ campaignName, ad }: MetaAdPreviewCardProps): React.ReactElement {
  const t = useTranslations('Campaigns');
  const hostname = parseHostname(ad.linkUrl);
  const initials = campaignName.trim().slice(0, 2).toUpperCase() || 'AD';

  const ctaKey = ad.callToActionType ? ad.callToActionType.toLowerCase() : 'learn_more';
  const ctaLabel = t(`cta.${ctaKey}`, { defaultMessage: ad.callToActionType?.replace(/_/g, ' ') || 'Learn More' });

  return (
    <div
      data-testid="meta-ad-preview-card"
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-md"
    >
      {/* Sponsor Header */}
      <div className="flex items-center justify-between border-b border-border/50 p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-xs font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            {initials}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="truncate text-xs font-semibold leading-tight text-foreground">{campaignName}</span>
            <span className="text-[10px] text-muted-foreground">{t('metaSponsoredLabel')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ad.status && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                ad.status === 'ACTIVE' || ad.status === 'enabled'
                  ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {ad.status}
            </span>
          )}
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>

      {/* Primary Copy */}
      {ad.primaryText && (
        <div className="p-3.5 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap" dir="auto">
          {ad.primaryText}
        </div>
      )}

      {/* Visual Asset Container */}
      <div className="relative aspect-video w-full overflow-hidden border-y border-border/40 bg-muted/30 flex items-center justify-center">
        {ad.imageUrl ? (
          <img
            src={ad.imageUrl}
            alt={ad.headline ?? ad.adName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <Megaphone className="h-8 w-8 text-primary/40" aria-hidden="true" />
            <span className="text-xs font-medium">{t('metaAdVisualPreviewPlaceholder')}</span>
          </div>
        )}
      </div>

      {/* Link & Headline Bar */}
      <div className="flex items-center justify-between gap-3 bg-muted/20 p-3.5">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground" dir="ltr">
            {hostname}
          </span>
          {ad.headline && (
            <span className="line-clamp-1 text-xs font-bold leading-snug text-foreground" dir="auto">
              {ad.headline}
            </span>
          )}
          {ad.description && (
            <span className="line-clamp-1 text-[11px] text-muted-foreground" dir="auto">
              {ad.description}
            </span>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-input bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground shadow-xs hover:bg-secondary/80"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
