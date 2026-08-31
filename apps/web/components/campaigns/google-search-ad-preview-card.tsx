'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';

export interface GoogleSearchAdPreviewCardProps {
  campaignName: string;
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  keywords?: string[];
  className?: string;
}

function parseHostname(finalUrl: string): string {
  if (!finalUrl) return 'growthos.io';
  try {
    const url = new URL(finalUrl.startsWith('http') ? finalUrl : `https://${finalUrl}`);
    return url.hostname;
  } catch {
    return finalUrl;
  }
}

export function GoogleSearchAdPreviewCard({
  campaignName,
  headlines,
  descriptions,
  finalUrl,
  keywords = [],
  className = '',
}: GoogleSearchAdPreviewCardProps): React.ReactElement {
  const t = useTranslations('Campaigns');
  const hostname = parseHostname(finalUrl);
  const pathSlug =
    campaignName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'campaign';

  return (
    <div
      data-testid="google-search-ad-preview-card"
      className={`flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-xs transition-all duration-200 hover:shadow-md ${className}`}
    >
      {/* Header: Sponsored Pill + Breadcrumb */}
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          {t('googleSponsoredLabel')}
        </span>
        <span className="truncate text-muted-foreground font-mono text-[11px]" dir="ltr">
          {hostname}{' › ads › '}{pathSlug}
        </span>
      </div>

      {/* Blue Clickable RSA Headline Bar */}
      <div
        className="cursor-pointer text-sm font-bold text-blue-600 hover:underline dark:text-blue-400 flex flex-wrap items-center gap-1.5 leading-snug"
        dir="auto"
      >
        {headlines.length > 0 ? (
          headlines.map((headline, idx) => (
            <span key={`${headline}-${idx}`} className="flex items-center gap-1.5">
              <span>{headline}</span>
              {idx < headlines.length - 1 ? (
                <span className="font-normal text-muted-foreground">{' | '}</span>
              ) : null}
            </span>
          ))
        ) : (
          <span>{campaignName}</span>
        )}
      </div>

      {/* Description Snippets */}
      <div className="flex flex-col gap-1.5 text-xs leading-relaxed text-foreground/80" dir="auto">
        {descriptions.map((desc, idx) => (
          <p key={`${desc}-${idx}`}>{desc}</p>
        ))}
      </div>

      {/* Target Keywords Chips */}
      {keywords.length > 0 ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            {t('keywordsLabel')}{': '}
          </span>
          {keywords.map((kw) => (
            <Badge key={kw} variant="secondary" size="sm" className="font-normal">
              {kw}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
