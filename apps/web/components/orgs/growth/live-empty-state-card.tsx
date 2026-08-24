'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  Code,
  Radio,
  ExternalLink,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

export interface LiveEmptyStateCardProps {
  orgId: string;
  projectId: string;
  projectName: string;
  onOpenSnippetModal: () => void;
  onSwitchToDemo: () => void;
}

export function LiveEmptyStateCard({
  orgId,
  onOpenSnippetModal,
  onSwitchToDemo,
}: LiveEmptyStateCardProps): React.ReactElement {
  const t = useTranslations('GrowthDashboard');

  return (
    <Card className="flex flex-col items-center justify-center gap-6 rounded-3xl border border-dashed border-border bg-card/60 p-8 sm:p-12 text-center shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Radio className="h-7 w-7 animate-pulse" aria-hidden="true" />
      </div>

      <div className="flex max-w-md flex-col gap-2">
        <h3 className="text-lg font-bold text-foreground">{t('noLiveDataYet')}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('noLiveDataSubtitle')}
        </p>
      </div>

      {/* Quick 3-Step Action Cards */}
      <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3 text-start">
        {/* Step 1: Web Snippet */}
        <div
          onClick={onOpenSnippetModal}
          className="flex cursor-pointer flex-col justify-between rounded-2xl border border-border/80 bg-background p-4 hover:border-primary/50 transition-all shadow-xs"
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold text-foreground">{`1. ${t('sourceWebPixel')}`}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{t('snippetInstruction')}</p>
          </div>
          <span className="mt-3 flex items-center gap-1 text-[11px] font-bold text-primary">
            <span>{t('copySnippetButton')}</span>
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>

        {/* Step 2: Google Ads */}
        <Link
          href={`/orgs/${orgId}/plugins`}
          className="flex flex-col justify-between rounded-2xl border border-border/80 bg-background p-4 hover:border-primary/50 transition-all shadow-xs"
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-xs font-bold text-foreground">{`2. Google Ads`}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{t('connectGoogleAds')}</p>
          </div>
          <span className="mt-3 flex items-center gap-1 text-[11px] font-bold text-primary">
            <span>{t('connectButton')}</span>
            <ExternalLink className="h-3 w-3" />
          </span>
        </Link>

        {/* Step 3: Meta Ads */}
        <Link
          href={`/orgs/${orgId}/plugins`}
          className="flex flex-col justify-between rounded-2xl border border-border/80 bg-background p-4 hover:border-primary/50 transition-all shadow-xs"
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-600" />
              <span className="text-xs font-bold text-foreground">{`3. Meta Ads`}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{t('connectMetaAds')}</p>
          </div>
          <span className="mt-3 flex items-center gap-1 text-[11px] font-bold text-primary">
            <span>{t('connectButton')}</span>
            <ExternalLink className="h-3 w-3" />
          </span>
        </Link>
      </div>

      {/* Switch to Demo Mode Button */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="outline"
          className="gap-2 rounded-xl text-xs font-semibold"
          onClick={onSwitchToDemo}
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span>{t('switchToDemoMode')}</span>
        </Button>
      </div>
    </Card>
  );
}
