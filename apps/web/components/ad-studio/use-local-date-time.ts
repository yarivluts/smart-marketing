'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';

/**
 * Formats a timestamp in the viewer's own time zone - in the browser only. The server renders in UTC
 * and the browser in local time, so formatting during the server render puts different text in each
 * and React rejects the page (hydration error #418). Until the page has mounted this returns ''.
 */
export function useLocalDateTime(style: { dateStyle: 'short' | 'medium'; timeStyle: 'short' }): (iso: string | null | undefined) => string {
  const locale = useLocale();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const { dateStyle, timeStyle } = style;
  const format = React.useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle, timeStyle }), [locale, dateStyle, timeStyle]);
  return React.useCallback(
    (iso) => {
      if (!mounted || !iso) return '';
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? '' : format.format(date);
    },
    [mounted, format],
  );
}
