'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Sparkles, Radio, Code } from 'lucide-react';

export interface DemoModeBannerProps {
  projectName: string;
  isDemoMode: boolean;
  onToggleMode: (isDemo: boolean) => void;
  onOpenConnectModal: () => void;
}

export function DemoModeBanner({
  projectName,
  isDemoMode,
  onToggleMode,
  onOpenConnectModal,
}: DemoModeBannerProps): React.ReactElement {
  const t = useTranslations('GrowthDashboard');

  if (isDemoMode) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-4 text-xs shadow-xs">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-amber-500/15 p-2 text-amber-600 dark:text-amber-400">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground">
                {t('demoModeBannerTitle', { projectName })}
              </span>
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                {t('demoModeBadge')}
              </span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              {t('demoModeBannerDescription')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-xl border-border bg-background text-xs font-semibold hover:bg-muted"
            onClick={() => onToggleMode(false)}
          >
            <Radio className="h-3.5 w-3.5 text-primary" />
            <span>{t('switchToLiveMode')}</span>
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-xl text-xs font-semibold"
            onClick={onOpenConnectModal}
          >
            <Code className="h-3.5 w-3.5" />
            <span>{t('connectCodeButton')}</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4 text-xs shadow-xs">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-emerald-500/15 p-2 text-emerald-600 dark:text-emerald-400">
          <Radio className="h-4 w-4 animate-pulse" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">{t('liveModeBannerTitle')}</span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              {t('liveDataBadge')}
            </span>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            {t('liveModeBannerDescription', { projectName })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 rounded-xl border-border bg-background text-xs font-semibold hover:bg-muted"
          onClick={() => onToggleMode(true)}
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span>{t('switchToDemoMode')}</span>
        </Button>
      </div>
    </div>
  );
}
