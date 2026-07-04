'use client';

import { useLocale, useTranslations } from 'next-intl';
import { routing, type AppLocale } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LocaleSwitcher(): React.ReactElement {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    const nextLocale = event.target.value as AppLocale;
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>{t('label')}</span>
      <select
        aria-label={t('label')}
        value={locale}
        onChange={handleChange}
        className="rounded-md border border-input bg-background px-2 py-1"
      >
        {routing.locales.map((value) => (
          <option key={value} value={value}>
            {t(value)}
          </option>
        ))}
      </select>
    </label>
  );
}
