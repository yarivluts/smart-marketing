'use client';

import { useTranslations } from 'next-intl';

export interface GoogleSearchAdPreviewCardProps {
  campaignName: string;
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  keywords?: string[];
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
}: GoogleSearchAdPreviewCardProps): React.ReactElement {
  const t = useTranslations('Campaigns');
  const hostname = parseHostname(finalUrl);
  const pathSlug = campaignName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'campaign';

  return (
    <div
      data-testid="google-search-ad-preview-card"
      className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md"
    >
      {/* Header: Sponsored Pill + Breadcrumb */}
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-foreground">
          {t('googleSponsoredLabel')}
        </span>
        <span className="truncate text-muted-foreground" dir="ltr">
          {hostname}{' › ads › '}{pathSlug}
        </span>
      </div>

      {/* Blue Clickable RSA Headline Bar */}
      <div
        className="cursor-pointer text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400 flex flex-wrap items-center gap-1.5 leading-snug"
        dir="auto"
      >
        {headlines.length > 0 ? (
          headlines.map((headline, idx) => (
            <span key={`${headline}-${idx}`} className="flex items-center gap-1.5">
              <span>{headline}</span>
              {idx < headlines.length - 1 && <span className="font-normal text-muted-foreground">{' | '}</span>}
            </span>
          ))
        ) : (
          <span>{campaignName}</span>
        )}
      </div>

      {/* Description Snippets */}
      <div className="flex flex-col gap-1 text-xs leading-relaxed text-foreground/80" dir="auto">
        {descriptions.map((desc, idx) => (
          <p key={`${desc}-${idx}`}>{desc}</p>
        ))}
      </div>

      {/* Target Keywords Chips */}
      {keywords.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('keywordsLabel')}{': '}</span>
          {keywords.map((kw) => (
            <span key={kw} className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {kw}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
