import * as React from 'react';
import { Quote } from 'lucide-react';

export interface ThemeDigestItem {
  key: string;
  label: string;
  count: number;
  /** The count as shown, e.g. "4 comments". */
  countLabel: string;
  /** Example comments for the theme, already wrapped in quotation marks by the caller. */
  quotes: readonly string[];
}

export interface ThemeDigestGridProps {
  items: readonly ThemeDigestItem[];
  /** Quotes shown per theme after removing repeats. */
  maxQuotes?: number;
}

/**
 * Free-text comment themes as cards: each theme's comment count as a bar against the biggest theme,
 * with a couple of its real, de-duplicated comments underneath - so the reader sees both how loud a
 * theme is and what people actually wrote. Pure markup, server-safe.
 */
export function ThemeDigestGrid({ items, maxQuotes = 2 }: ThemeDigestGridProps): React.ReactElement {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul className="grid gap-4 md:grid-cols-2" data-testid="theme-digest-grid">
      {items.map((item) => {
        const quotes = [...new Set(item.quotes)].slice(0, maxQuotes);
        return (
          <li key={item.key} className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-foreground">{item.label}</span>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">{item.countLabel}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-warning" style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
            {quotes.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {quotes.map((quote) => (
                  <li key={quote} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                    <span className="min-w-0">{quote}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
