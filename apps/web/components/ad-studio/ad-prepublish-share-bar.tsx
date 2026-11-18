'use client';

import * as React from 'react';
import { ChevronDown, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ShareLinksPanel, type ShareLinkRow } from './share-links-panel';

export interface AdPrepublishShareBarProps {
  orgId: string;
  projectId: string;
  briefId: string;
  briefName: string;
  initialLinks: ShareLinkRow[];
  defaultOpen?: boolean;
}

/**
 * Always-accessible pre-publication sharing bar for an open ad: lets managers generate and manage
 * a read-only preview link (with draft concepts, scripts, scene clips, and client approval) at any
 * stage before campaign launch.
 */
export function AdPrepublishShareBar({
  orgId,
  projectId,
  briefId,
  briefName,
  initialLinks,
  defaultOpen = false,
}: AdPrepublishShareBarProps): React.ReactElement {
  const t = useTranslations('AdShare.manage');
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <section
      className="flex flex-col overflow-hidden rounded-3xl border border-pp-outline-variant/45 bg-card shadow-pp-candy"
      data-testid="ad-prepublish-share-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pp-primary-fixed text-pp-primary">
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-pp-display text-sm font-bold text-foreground">{t('prePublishBarTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('prePublishBarHint')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          data-testid="ad-prepublish-share-toggle"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-pp-primary/30 bg-pp-primary-fixed/70 px-4 text-xs font-semibold text-pp-primary transition-colors hover:bg-pp-primary-fixed"
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{open ? t('prePublishBarClose') : t('prePublishBarOpen')}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>
      {open ? (
        <div className="border-t border-border/50 p-4 sm:p-5">
          <ShareLinksPanel
            orgId={orgId}
            projectId={projectId}
            briefs={[{ id: briefId, name: briefName }]}
            initialLinks={initialLinks}
            defaultBriefId={briefId}
            defaultIncludeDrafts
            defaultIncludeResults={false}
          />
        </div>
      ) : null}
    </section>
  );
}
