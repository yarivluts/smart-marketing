'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { routing, type AppLocale } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface LanguageSwitcherProps {
  className?: string;
  compact?: boolean;
}

export function LanguageSwitcher({ className, compact = false }: LanguageSwitcherProps): React.ReactElement {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function handleLocaleChange(nextLocale: AppLocale): void {
    if (nextLocale !== locale) {
      router.replace(pathname, { locale: nextLocale });
    }
  }

  return (
    <div className={cn('inline-flex items-center rounded-xl border border-input bg-background/80 p-1 shadow-soft', className)}>
      <div className="flex items-center gap-1">
        <span className="ps-1.5 pe-1 text-muted-foreground" aria-hidden="true">
          <Globe className="h-3.5 w-3.5" />
        </span>
        {routing.locales.map((cur) => {
          const isActive = cur === locale;
          return (
            <button
              key={cur}
              type="button"
              onClick={() => handleLocaleChange(cur)}
              aria-label={t(cur)}
              aria-pressed={isActive}
              className={cn(
                'rounded-lg px-2 py-1 text-xs font-semibold uppercase transition-all duration-150',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              )}
            >
              {compact ? cur.toUpperCase() : t(cur)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
