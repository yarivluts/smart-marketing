'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { searchAdDisplayUrl } from '@growthos/shared';

export interface SearchResultPreviewProps {
  headlines: readonly string[];
  descriptions: readonly string[];
  path1: string;
  path2: string;
  linkUrl: string | null;
  advertiser: string;
  /** Which combination to show: Google rotates headlines and descriptions per search. */
  combination?: number;
}

/** How a responsive search ad can show on a Google results page: three headlines and two descriptions. */
export function SearchResultPreview({
  headlines,
  descriptions,
  path1,
  path2,
  linkUrl,
  advertiser,
  combination = 0,
}: SearchResultPreviewProps): React.ReactElement {
  const t = useTranslations('AdStudio.search');
  const lines = (list: readonly string[]) => list.map((line) => line.trim()).filter(Boolean);
  const pick = (list: string[], count: number) =>
    list.length
      ? Array.from(
          { length: Math.min(count, list.length) },
          (_, index) => list[(index + combination) % list.length],
        )
      : [];
  return (
    <div
      className="rounded-xl border border-border bg-background p-4 shadow-sm"
      data-testid="ad-studio-search-preview"
    >
      <div className="flex items-center gap-2 text-xs">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold"
          aria-hidden="true"
        >
          {advertiser.trim().charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium" dir="auto">
            {advertiser}
          </span>
          <span className="truncate text-muted-foreground" dir="ltr">
            {searchAdDisplayUrl(linkUrl, { path1, path2 })}
          </span>
        </div>
      </div>
      <p className="mt-1 text-[11px] font-semibold">{t('sponsored')}</p>
      <p className="mt-1 text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]" dir="auto">
        {pick(lines(headlines), 3).join(' | ') || t('previewHeadlinePlaceholder')}
      </p>
      <p className="mt-1 text-sm text-muted-foreground" dir="auto">
        {pick(lines(descriptions), 2).join(' ') || t('previewDescriptionPlaceholder')}
      </p>
    </div>
  );
}
