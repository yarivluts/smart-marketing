'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Film, Globe, Loader2, RefreshCw } from 'lucide-react';
import type { AdStudioSiteScrollPageView } from '@growthos/shared';
import { cn } from '@/lib/utils';
import { withFirstFrame } from './media-src';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface SiteScrollPanelProps {
  orgId: string;
  projectId: string;
  briefId: string;
  linkUrl: string | null;
  initialPages: AdStudioSiteScrollPageView[];
  scenes: { id: string }[];
  busy?: boolean;
  /** Automatically scans `linkUrl` once when opening with no scanned pages yet (default true). */
  autoScan?: boolean;
  onUseInScene?: (sitePageId: string, sceneId: string) => Promise<void> | void;
  onScanned?: (pages: AdStudioSiteScrollPageView[]) => void;
}

/**
 * Scans the brief's public website without login details, captures full-page screenshots of the
 * homepage and relevant product pages, and turns them into smooth scrolling video clips that can
 * be auto-woven into the ad or dropped into a specific scene.
 */
export function SiteScrollPanel({
  orgId,
  projectId,
  briefId,
  linkUrl,
  initialPages,
  scenes,
  busy = false,
  autoScan = true,
  onUseInScene,
  onScanned,
}: SiteScrollPanelProps): React.ReactElement {
  const t = useTranslations('AdStudio');
  const errorMessage = useAdStudioErrorMessage();
  const [pages, setPages] = React.useState<AdStudioSiteScrollPageView[]>(initialPages);
  React.useEffect(() => setPages(initialPages), [initialPages]);

  const [urlDraft, setUrlDraft] = React.useState(linkUrl ?? '');
  React.useEffect(() => setUrlDraft(linkUrl ?? ''), [linkUrl]);

  const [scanning, setScanning] = React.useState(false);
  const [savingSelection, setSavingSelection] = React.useState(false);
  const [applyingPageId, setApplyingPageId] = React.useState<string | null>(null);
  const [sceneByPage, setSceneByPage] = React.useState<Record<string, string>>({});
  const [feedback, setFeedback] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const autoScannedKey = React.useRef<string | null>(null);
  const urlInputId = React.useId();

  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}/site-pages`;

  const runScan = React.useCallback(
    async (targetUrl: string, silent = false) => {
      const trimmed = targetUrl.trim();
      if (!trimmed) return;
      setScanning(true);
      if (!silent) setFeedback(null);
      try {
        const response = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteUrl: trimmed }),
        });
        const result = (await response.json().catch(() => ({}))) as AdStudioApiError & {
          sitePages?: AdStudioSiteScrollPageView[];
        };
        if (!response.ok) {
          setFeedback({ tone: 'error', text: errorMessage(result) });
          return;
        }
        const nextPages = result.sitePages ?? [];
        setPages(nextPages);
        onScanned?.(nextPages);
        if (!silent) {
          setFeedback({ tone: 'ok', text: t('siteScroll.scanSuccess') });
        }
      } catch {
        setFeedback({ tone: 'error', text: t('errorGeneric') });
      } finally {
        setScanning(false);
      }
    },
    [base, errorMessage, onScanned, t],
  );

  React.useEffect(() => {
    if (!autoScan) return;
    const trimmed = (linkUrl ?? '').trim();
    if (!trimmed || initialPages.length > 0) return;
    const key = `${briefId}:${trimmed}`;
    if (autoScannedKey.current === key) return;
    autoScannedKey.current = key;
    // Once per ad and address per browser: a site that cannot be scanned would otherwise be
    // re-scanned (tens of seconds of server work, ending in the same error) on every visit.
    // The button still scans again whenever the person asks.
    const storageKey = `adStudio.siteAutoScan.${key}`;
    try {
      if (window.localStorage.getItem(storageKey)) return;
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // Storage blocked: fall back to once per page load.
    }
    void runScan(trimmed, true);
  }, [autoScan, briefId, initialPages.length, linkUrl, runScan]);

  async function togglePageSelection(pageId: string): Promise<void> {
    const nextIds = pages
      .filter((entry) => (entry.id === pageId ? !entry.selected : entry.selected))
      .map((entry) => entry.id);
    setSavingSelection(true);
    setFeedback(null);
    try {
      const response = await fetch(base, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedPageIds: nextIds }),
      });
      const result = (await response.json().catch(() => ({}))) as AdStudioApiError & {
        sitePages?: AdStudioSiteScrollPageView[];
      };
      if (!response.ok) {
        setFeedback({ tone: 'error', text: errorMessage(result) });
        return;
      }
      if (result.sitePages) setPages(result.sitePages);
      setFeedback({ tone: 'ok', text: t('siteScroll.selectionSaved') });
    } catch {
      setFeedback({ tone: 'error', text: t('errorGeneric') });
    } finally {
      setSavingSelection(false);
    }
  }

  async function handleUseInScene(pageId: string): Promise<void> {
    if (!onUseInScene) return;
    const fallbackSceneId = scenes[0]?.id;
    const targetSceneId = sceneByPage[pageId] || fallbackSceneId;
    if (!targetSceneId) return;
    setApplyingPageId(pageId);
    try {
      await onUseInScene(pageId, targetSceneId);
    } finally {
      setApplyingPageId(null);
    }
  }

  const fallbackSceneId = scenes[0]?.id ?? '';

  return (
    <section
      className="flex flex-col gap-3 rounded-3xl border border-pp-outline-variant/40 bg-card p-4 shadow-pp-candy sm:p-5"
      aria-labelledby="ad-studio-site-scroll-heading"
      data-testid="ad-studio-site-scroll"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Globe className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id="ad-studio-site-scroll-heading" className="font-pp-display text-sm font-bold">
              {t('siteScroll.title')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('siteScroll.description')}</p>
          </div>
        </div>
        {pages.length > 0 ? (
          <span
            className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
            data-testid="ad-studio-site-scroll-count"
          >
            {t('siteScroll.scannedCount', { count: pages.length })}
          </span>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void runScan(urlDraft, false);
        }}
      >
        <label htmlFor={urlInputId} className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('siteScroll.urlLabel')}
          <input
            id={urlInputId}
            type="url"
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            placeholder={t('siteScroll.urlPlaceholder')}
            dir="ltr"
            data-testid="ad-studio-site-scroll-url"
            className="h-9 min-w-0 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
        <button
          type="submit"
          disabled={scanning || busy || urlDraft.trim().length === 0}
          data-testid="ad-studio-site-scroll-scan"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {scanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {scanning
            ? t('siteScroll.scanning')
            : pages.length > 0
              ? t('siteScroll.rescan')
              : t('siteScroll.scanNow')}
        </button>
      </form>

      {feedback ? (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          data-testid="ad-studio-site-scroll-feedback"
          className={cn(
            'text-xs font-medium',
            feedback.tone === 'error' ? 'text-destructive' : 'text-success',
          )}
        >
          {feedback.text}
        </p>
      ) : null}

      {pages.length === 0 && !scanning ? (
        <p className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
          {t('siteScroll.emptyHint')}
        </p>
      ) : null}

      {pages.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-xs text-muted-foreground">{t('siteScroll.autoWeaveHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page, index) => {
              const targetScene = sceneByPage[page.id] || fallbackSceneId;
              return (
                <article
                  key={page.id}
                  data-testid={`ad-studio-site-scroll-page-${index + 1}`}
                  className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-background/60 p-3"
                >
                  <video
                    src={withFirstFrame(page.videoUrl)}
                    poster={page.screenshotUrl}
                    controls
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label={page.title}
                    className="aspect-[9/16] max-h-56 w-full rounded-xl bg-black/90 object-cover"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {t(`siteScroll.kind.${page.kind}`)}
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {t('siteScroll.durationBadge', { seconds: page.durationSeconds })}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground" dir="auto">
                      {page.title}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
                      {page.hostAndPath}
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={page.selected}
                      disabled={savingSelection || busy}
                      onChange={() => void togglePageSelection(page.id)}
                      data-testid={`ad-studio-site-scroll-toggle-${index + 1}`}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span>{t('siteScroll.includeInVideo')}</span>
                  </label>
                  {onUseInScene && scenes.length > 0 ? (
                    <div className="mt-auto flex items-center gap-1.5 pt-1">
                      {scenes.length > 1 ? (
                        <select
                          aria-label={t('siteScroll.sceneSelectLabel')}
                          value={targetScene}
                          onChange={(event) =>
                            setSceneByPage((cur) => ({ ...cur, [page.id]: event.target.value }))
                          }
                          disabled={busy || applyingPageId !== null}
                          className="h-8 min-w-0 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
                        >
                          {scenes.map((scene, sceneIdx) => (
                            <option key={scene.id} value={scene.id}>
                              {t('sceneLabel', { number: sceneIdx + 1 })}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || applyingPageId !== null}
                        onClick={() => void handleUseInScene(page.id)}
                        data-testid={`ad-studio-site-scroll-use-${index + 1}`}
                        className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                      >
                        {applyingPageId === page.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Film className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {t('siteScroll.useInScene')}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
