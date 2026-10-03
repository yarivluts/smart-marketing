import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    onError(error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[next-intl error]', error.message);
      }
    },
    getMessageFallback({ namespace, key }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});
