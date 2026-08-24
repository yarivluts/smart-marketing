'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  Code,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Package,
  Layers,
} from 'lucide-react';

export interface LiveSourceStatusBarProps {
  orgId: string;
  projectId: string;
  hasGoogleAds: boolean;
  hasMetaAds: boolean;
  hasWebPixel: boolean;
  pluginPackNames: string[];
  onOpenSnippetModal: () => void;
}

export function LiveSourceStatusBar({
  orgId,
  hasGoogleAds,
  hasMetaAds,
  hasWebPixel,
  pluginPackNames,
  onOpenSnippetModal,
}: LiveSourceStatusBarProps): React.ReactElement {
  const t = useTranslations('GrowthDashboard');

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Layers className="h-4 w-4 text-primary" />
          <span>{t('sourceStatusTitle')}</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 rounded-lg text-xs font-semibold"
          onClick={onOpenSnippetModal}
        >
          <Code className="h-3.5 w-3.5 text-primary" />
          <span>{t('copySnippetButton')}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Website Tracking Pixel */}
        <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-muted-foreground">{t('sourceWebPixel')}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {hasWebPixel ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {t('sourceWebPixelActive')}
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                    {t('sourceWebPixelWaiting')}
                  </span>
                </>
              )}
            </div>
          </div>
          {!hasWebPixel ? (
            <Button size="sm" variant="ghost" className="h-7 text-xs font-semibold" onClick={onOpenSnippetModal}>
              {t('copyCodeButton')}
            </Button>
          ) : null}
        </div>

        {/* 2. Google Ads Account */}
        <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-muted-foreground">{t('sourceGoogleAds')}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {hasGoogleAds ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {t('sourceGoogleAdsConnected')}
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t('sourceGoogleAdsDisconnected')}
                  </span>
                </>
              )}
            </div>
          </div>
          {!hasGoogleAds ? (
            <Link
              href={`/orgs/${orgId}/plugins`}
              className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
            >
              <span>{t('connectButton')}</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>

        {/* 3. Meta Ads Account */}
        <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-muted-foreground">{t('sourceMetaAds')}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {hasMetaAds ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {t('sourceMetaAdsConnected')}
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t('sourceMetaAdsDisconnected')}
                  </span>
                </>
              )}
            </div>
          </div>
          {!hasMetaAds ? (
            <Link
              href={`/orgs/${orgId}/plugins`}
              className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
            >
              <span>{t('connectButton')}</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>

        {/* 4. Metric Packs */}
        <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-muted-foreground">{t('sourcePacks')}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Package className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-xs font-bold text-foreground truncate max-w-[140px]">
                {pluginPackNames.length > 0 ? pluginPackNames.join(', ') : 'Landing Page Pack'}
              </span>
            </div>
          </div>
          <Link
            href={`/orgs/${orgId}/plugins`}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            title="Manage plugins"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
