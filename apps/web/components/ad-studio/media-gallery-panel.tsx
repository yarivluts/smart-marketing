'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Film, Globe, Image as ImageIcon, Loader2, Trash2, Upload, X } from 'lucide-react';
import type { AdStudioGalleryItemView } from '@growthos/shared';
import { cn } from '@/lib/utils';
import { withFirstFrame } from './media-src';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

type FilterTab = 'all' | 'image' | 'video' | 'walkthrough';

export interface MediaGalleryPanelProps {
  orgId: string;
  projectId: string;
  briefId?: string;
  initialItems?: AdStudioGalleryItemView[];
  /** Filters or locks picker mode for choosing a specific kind (`'image'` or `'video'`). */
  acceptKind?: 'image' | 'video';
  /** Called when the user selects an existing item or newly uploaded gallery item in picker mode. */
  onSelect?: (item: AdStudioGalleryItemView) => void;
  /** Also offered when in picker mode so the user can upload a file directly without gallery round-trip if desired. */
  onUploadFile?: (file: File, saveToGallery: boolean) => unknown;
  onClose?: () => void;
  title?: string;
  busy?: boolean;
  refreshKey?: number;
}

export function MediaGalleryPanel({
  orgId,
  projectId,
  briefId,
  initialItems = [],
  acceptKind,
  onSelect,
  onUploadFile,
  onClose,
  title,
  busy = false,
  refreshKey = 0,
}: MediaGalleryPanelProps): React.ReactElement {
  const t = useTranslations('AdStudio.mediaGallery');
  const tRoot = useTranslations('AdStudio');
  const errorMessage = useAdStudioErrorMessage();
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/gallery`;

  const [items, setItems] = React.useState<AdStudioGalleryItemView[]>(initialItems);
  const [loading, setLoading] = React.useState(initialItems.length === 0);
  const [uploading, setUploading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<FilterTab>(acceptKind ?? 'all');
  const [saveToGallery, setSaveToGallery] = React.useState(true);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const qs = briefId ? `?briefId=${encodeURIComponent(briefId)}` : '';
      const response = await fetch(`${base}${qs}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { items?: AdStudioGalleryItemView[] };
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [base, briefId]);

  React.useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const scopedItems = React.useMemo(
    () => (acceptKind ? items.filter((item) => item.kind === acceptKind) : items),
    [items, acceptKind],
  );

  const visible = React.useMemo(() => {
    if (filter === 'all') return scopedItems;
    if (filter === 'walkthrough') return scopedItems.filter((item) => item.source === 'walkthrough');
    return scopedItems.filter((item) => item.kind === filter);
  }, [scopedItems, filter]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setNotice(null);

    if (onUploadFile) {
      setUploading(true);
      try {
        await onUploadFile(file, saveToGallery);
        await load();
      } catch {
        setNotice({ tone: 'error', text: tRoot('errorGeneric') });
      } finally {
        setUploading(false);
      }
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch(base, { method: 'POST', body: form });
      const data = (await response.json()) as { item?: AdStudioGalleryItemView } & AdStudioApiError;
      if (!response.ok || !data.item) {
        setNotice({ tone: 'error', text: errorMessage(data) });
        return;
      }
      const createdItem = data.item;
      setItems((current) => [createdItem, ...current]);
      setNotice({ tone: 'ok', text: t('uploadDone') });
      if (onSelect && (!acceptKind || createdItem.kind === acceptKind)) {
        onSelect(createdItem);
      }
    } catch {
      setNotice({ tone: 'error', text: tRoot('errorGeneric') });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(item: AdStudioGalleryItemView): Promise<void> {
    if (!item.assetId) return;
    setDeletingId(item.assetId);
    setNotice(null);
    try {
      const response = await fetch(`${base}/${item.assetId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as AdStudioApiError;
        setNotice({ tone: 'error', text: errorMessage(body) });
        return;
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setNotice({ tone: 'ok', text: t('deleted') });
    } catch {
      setNotice({ tone: 'error', text: tRoot('errorGeneric') });
    } finally {
      setDeletingId(null);
    }
  }

  const acceptAttr =
    acceptKind === 'image'
      ? 'image/png,image/jpeg,image/webp'
      : acceptKind === 'video'
        ? 'video/mp4,video/webm,video/quicktime'
        : 'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime';

  const filterTabs: FilterTab[] = acceptKind
    ? [acceptKind, 'walkthrough']
    : ['all', 'image', 'video', 'walkthrough'];

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4"
      data-testid="ad-studio-media-gallery"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-pp-display text-base font-semibold">{title ?? t('title')}</h3>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptAttr}
            onChange={(event) => void handleFileChange(event)}
            className="hidden"
            data-testid="ad-studio-gallery-file-input"
          />
          <button
            type="button"
            disabled={uploading || busy}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            data-testid="ad-studio-gallery-upload-btn"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {uploading ? t('uploading') : t('uploadMedia')}
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('closePicker')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {onUploadFile ? (
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={saveToGallery}
            onChange={(event) => setSaveToGallery(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          <span>{t('saveToGallery')}</span>
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-1 rounded-full bg-muted p-1 w-fit" role="tablist">
        {filterTabs.map((tab) => {
          const active = filter === tab || (tab === acceptKind && filter !== 'walkthrough');
          const label =
            tab === 'all'
              ? t('filterAll', { count: scopedItems.length })
              : tab === 'image'
                ? t('filterImages')
                : tab === 'video'
                  ? t('filterVideos')
                  : t('filterWalkthrough');
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {notice ? (
        <p role="status" className={notice.tone === 'ok' ? 'text-xs text-success' : 'text-xs text-destructive'}>
          {notice.text}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between gap-2 rounded-2xl border border-border/70 bg-background p-2.5"
              data-testid={`ad-studio-gallery-item-${item.id}`}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
                {item.kind === 'video' ? (
                  <video
                    src={withFirstFrame(item.mediaUrl)}
                    poster={item.thumbnailUrl ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={item.thumbnailUrl ?? item.mediaUrl}
                    alt={item.label}
                    className="h-full w-full object-cover"
                  />
                )}
                <span className="absolute start-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
                  {item.source === 'walkthrough' ? (
                    <Globe className="h-3 w-3 text-primary" aria-hidden="true" />
                  ) : item.kind === 'video' ? (
                    <Film className="h-3 w-3 text-primary" aria-hidden="true" />
                  ) : (
                    <ImageIcon className="h-3 w-3 text-primary" aria-hidden="true" />
                  )}
                  {t(`source.${item.source}`)}
                </span>
              </div>

              <div className="flex flex-col gap-0.5 px-0.5">
                <p className="truncate text-xs font-medium" dir="auto">
                  {item.label}
                </p>
                {item.description ? (
                  <p className="line-clamp-2 text-[11px] text-muted-foreground" dir="auto">
                    {item.description}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-1.5 pt-1">
                {onSelect ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSelect(item)}
                    className="inline-flex h-8 flex-1 items-center justify-center rounded-full bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                    data-testid={`ad-studio-gallery-select-${item.id}`}
                  >
                    {t('useItem')}
                  </button>
                ) : (
                  <a
                    href={item.mediaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    {t('openFull')}
                  </a>
                )}
                {item.deletable && item.assetId ? (
                  <button
                    type="button"
                    disabled={deletingId === item.assetId || busy}
                    onClick={() => void handleDelete(item)}
                    aria-label={t('deleteItem')}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                    data-testid={`ad-studio-gallery-delete-${item.id}`}
                  >
                    {deletingId === item.assetId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
