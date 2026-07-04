import { defineRouting } from 'next-intl/routing';

/**
 * Locale catalog for the whole app. Adding a locale here is enough to route,
 * generate static params, and show it in the LocaleSwitcher — it still needs
 * a matching messages/<locale>.json file.
 */
export const routing = defineRouting({
  locales: ['en', 'he'],
  defaultLocale: 'en',
});

export type AppLocale = (typeof routing.locales)[number];

/** RTL locales per the Unicode bidi script list; used to set <html dir>. */
const RTL_LOCALES: readonly AppLocale[] = ['he'];

export function getDirection(locale: string): 'rtl' | 'ltr' {
  return RTL_LOCALES.includes(locale as AppLocale) ? 'rtl' : 'ltr';
}
