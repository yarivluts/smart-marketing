'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Compass, LayoutGrid, Megaphone, Search, Target, Trophy, User, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { searchOmniSearchItems, type OmniSearchItem, type OmniSearchResultType } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const RESULT_ICONS: Record<OmniSearchResultType, typeof Search> = {
  board: LayoutGrid,
  metric: BarChart3,
  segment: Users,
  campaign: Megaphone,
  goal: Target,
  win_rule: Trophy,
  customer: User,
  page: Compass,
};

/** A customer match only ever comes from a live server-side substring search (KAN-116, unlike every other result type's eagerly-cached, client-ranked index) — short enough not to spend a warehouse query on every keystroke, but not so long the palette feels unresponsive. */
const CUSTOMER_SEARCH_MIN_QUERY_LENGTH = 2;
const CUSTOMER_SEARCH_DEBOUNCE_MS = 200;

interface OmniSearchTriggerProps {
  orgId: string;
  projectId: string;
  /**
   * Static "jump to this page" shortcuts for every nav destination
   * `ProjectLayout` renders — already translated and permission-filtered
   * server-side (see `buildOmniSearchPageShortcuts`), so unlike the fetched
   * `items` index below, these are available for ranking immediately, with
   * no fetch round-trip.
   */
  pageShortcuts?: OmniSearchItem[];
}

/**
 * KAN-85 global omnisearch: a Cmd/Ctrl-K palette jumping to a project's
 * boards, metrics, segments, campaigns, goals, win rules, and (KAN-85 follow-up)
 * every other nav page. The index is fetched lazily on
 * first open (not on every page load — see `omnisearch.ts`'s own doc
 * comment for why an eager per-page-load fetch would be too heavy) and then
 * ranked entirely client-side via the shared `searchOmniSearchItems`
 * heuristic as the user types, so results feel instant after that first
 * fetch. Customers (KAN-116) are the one exception: a debounced live
 * server-side search runs as the query changes and its matches are merged
 * in alongside the client-ranked results — see the effect below.
 */
export function OmniSearchTrigger({ orgId, projectId, pageShortcuts = [] }: OmniSearchTriggerProps): React.ReactElement {
  const t = useTranslations('OmniSearch');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<OmniSearchItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [customerItems, setCustomerItems] = useState<OmniSearchItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  // Discards a cached index when the project changes under this same component instance (React
  // reconciles by tree position, not prop equality, so a client-side transition that keeps
  // `OmniSearchTrigger` mounted while its `orgId`/`projectId` props change would otherwise keep
  // showing the previous project's boards/metrics/segments/campaigns).
  useEffect(() => {
    setItems(null);
    setCustomerItems([]);
  }, [orgId, projectId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === 'Escape') {
        close();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  useEffect(() => {
    if (!open || items !== null) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/orgs/${orgId}/projects/${projectId}/omnisearch`)
      .then((response) => (response.ok ? (response.json() as Promise<{ items?: OmniSearchItem[] }>) : { items: [] }))
      .then((data) => {
        if (!cancelled) {
          setItems(data.items ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, items, orgId, projectId]);

  // Customer results (KAN-116) never come from the eagerly-fetched, client-ranked `items` index
  // above — there is no bounded "list every customer" query to prefetch — so this debounces a
  // separate, targeted server request per query change instead, merging whatever it returns
  // alongside the client-ranked static results rather than re-filtering them through
  // `searchOmniSearchItems` (a customer can match on a property `searchOmniSearchItems` never
  // sees, since its own label is just the entity id, not the matched field).
  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!open || trimmedQuery.length < CUSTOMER_SEARCH_MIN_QUERY_LENGTH) {
      setCustomerItems([]);
      return;
    }
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      fetch(`/api/orgs/${orgId}/projects/${projectId}/omnisearch?q=${encodeURIComponent(trimmedQuery)}`)
        .then((response) => (response.ok ? (response.json() as Promise<{ items?: OmniSearchItem[] }>) : { items: [] }))
        .then((data) => {
          if (!cancelled) {
            setCustomerItems(data.items ?? []);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCustomerItems([]);
          }
        });
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [open, query, orgId, projectId]);

  const staticResults = useMemo(
    () => searchOmniSearchItems([...(items ?? []), ...pageShortcuts], query),
    [items, pageShortcuts, query],
  );
  const results = useMemo(() => [...staticResults, ...customerItems], [staticResults, customerItems]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [results.length, query]);

  function handleSelect(item: OmniSearchItem): void {
    close();
    router.push(item.href);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = results[highlightedIndex];
      if (selected) {
        handleSelect(selected);
      }
    }
    // Escape is handled by the document-level listener above.
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm text-muted-foreground shadow-soft hover:bg-accent/10"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-start">{t('trigger')}</span>
        <kbd className="hidden shrink-0 rounded border border-input px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80 md:inline-block">
          {t('shortcutHint')}
        </kbd>
      </button>

      {open ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[15vh] backdrop-blur-sm"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('dialogLabel')}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background shadow-soft-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={t('inputPlaceholder')}
                aria-label={t('inputPlaceholder')}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <ul role="listbox" aria-label={t('dialogLabel')} className="max-h-80 overflow-y-auto py-2">
              {query.trim() === '' ? (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t('emptyPrompt')}</li>
              ) : loading && results.length === 0 ? (
                // Page shortcuts (unlike the fetched index) rank immediately with no fetch wait
                // needed — only fall back to the loading state while there's truly nothing to show
                // yet, so a matching page shortcut still appears during that first fetch.
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t('loading')}</li>
              ) : results.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t('noResults', { query })}</li>
              ) : (
                results.map((item, index) => {
                  const Icon = RESULT_ICONS[item.type];
                  return (
                    <li
                      key={`${item.type}-${item.id}`}
                      role="option"
                      aria-selected={index === highlightedIndex}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => handleSelect(item)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-4 py-2 text-sm',
                        index === highlightedIndex ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent/10',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground/70">
                        {t('resultType', { type: item.type })}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
