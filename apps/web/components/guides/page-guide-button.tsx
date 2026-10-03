'use client';

import * as React from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPageGuide } from '@/lib/guides/page-guides-data';
import { PageGuideModal } from './page-guide-modal';
import { useSafeGuideIntl } from './use-safe-guide-intl';

export interface PageGuideButtonProps {
  pageKey?: string;
  pathname?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'inline' | 'pill';
  onAskCopilot?: (queryPrompt: string) => void;
}

export function PageGuideButton({
  pageKey,
  pathname,
  className,
  size = 'md',
  variant = 'inline',
  onAskCopilot,
}: PageGuideButtonProps): React.ReactElement {
  const { t, locale } = useSafeGuideIntl();

  const [isOpen, setIsOpen] = React.useState(false);

  // Resolve guide using explicit pageKey or current pathname (from prop or browser window)
  const guide = React.useMemo(() => {
    const activePath =
      pathname || (typeof window !== 'undefined' ? window.location?.pathname : '') || '';
    return getPageGuide(pageKey || activePath, locale);
  }, [pageKey, pathname, locale]);

  const sizeClasses =
    size === 'sm'
      ? 'h-6 w-6 text-xs'
      : size === 'lg'
        ? 'h-9 w-9 text-base'
        : 'h-7 w-7 text-sm';

  const iconSizes =
    size === 'sm'
      ? 'h-3.5 w-3.5'
      : size === 'lg'
        ? 'h-5 w-5'
        : 'h-4 w-4';

  return (
    <>
      {variant === 'pill' ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title={t('openGuideTooltip')}
          aria-label={t('openGuideTooltip')}
          data-testid="page-guide-trigger"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary',
            'hover:bg-primary/20 hover:border-primary/40 hover:scale-105 transition-all cursor-pointer shadow-xs',
            className,
          )}
        >
          <HelpCircle className={iconSizes} aria-hidden="true" />
          <span className="hidden sm:inline">{t('openGuideTooltip')}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title={t('openGuideTooltip')}
          aria-label={t('openGuideTooltip')}
          data-testid="page-guide-trigger"
          className={cn(
            'inline-flex items-center justify-center rounded-full text-muted-foreground transition-all cursor-pointer',
            'hover:text-primary hover:bg-primary/15 hover:scale-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50',
            sizeClasses,
            className,
          )}
        >
          <HelpCircle className={iconSizes} aria-hidden="true" />
        </button>
      )}

      <PageGuideModal
        guide={guide}
        open={isOpen}
        onOpenChange={setIsOpen}
        onAskCopilot={onAskCopilot}
      />
    </>
  );
}
