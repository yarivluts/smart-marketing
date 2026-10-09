'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { routing, type AppLocale } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface LocaleSwitcherProps {
  className?: string;
  hideLabel?: boolean;
}

export function LocaleSwitcher({
  className,
  hideLabel = false,
}: LocaleSwitcherProps = {}): React.ReactElement {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    const nextLocale = event.target.value as AppLocale;
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <label
      className={cn(
        'relative inline-flex items-center gap-1.5 text-xs font-medium text-pp-on-surface-variant cursor-pointer select-none',
        className,
      )}
    >
      <span className={hideLabel ? 'sr-only' : 'sr-only sm:not-sr-only sm:inline'}>
        {t('label')}
      </span>
      <div className="relative inline-flex items-center">
        <Globe
          className="pointer-events-none absolute start-2 h-3.5 w-3.5 text-pp-primary shrink-0 z-10"
          aria-hidden
        />
        <select
          aria-label={t('label')}
          value={locale}
          onChange={handleChange}
          className="appearance-none rounded-full border border-pp-outline-variant/60 bg-white/70 dark:bg-pp-surface-container-low hover:border-pp-primary/60 focus:border-pp-primary focus:outline-none focus:ring-2 focus:ring-pp-primary/20 ps-7 pe-6 py-1 text-xs font-semibold text-pp-on-surface cursor-pointer shadow-xs transition-colors"
        >
          {routing.locales.map((value) => (
            <option
              key={value}
              value={value}
              className="bg-white dark:bg-pp-surface-container text-pp-on-surface"
            >
              {t(value)}
            </option>
          ))}
        </select>
        <span
          className="pointer-events-none absolute end-2 text-[10px] text-pp-on-surface-variant/70 leading-none select-none"
          aria-hidden
        >
          ▾
        </span>
      </div>
    </label>
  );
}
