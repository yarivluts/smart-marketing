'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, Send, Upload } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export type ExportDestinationId = 'meta' | 'youtube';

export type ExportDestinationState =
  | { available: true; credentialName: string }
  | { available: false; reason: 'not_attached' | 'read_only' | 'no_secret'; credentialName?: string };

export interface ExportRow {
  id: string;
  destination: ExportDestinationId;
  title: string;
  privacy: string | null;
  status: 'uploading' | 'done' | 'failed';
  externalUrl: string | null;
  failureCode: string | null;
  requestedOn: string;
}

export interface ExportPanelProps {
  orgId: string;
  projectId: string;
  briefId: string;
  /** The assembled, current video to export; null until one exists. */
  video: { id: string; durationSeconds: number } | null;
  destinations: Record<ExportDestinationId, ExportDestinationState>;
  exports: ExportRow[];
  canExport: boolean;
  defaultTitle: string;
  defaultDescription: string;
  resourcesHref: string;
}

const DESTINATIONS: ExportDestinationId[] = ['meta', 'youtube'];
const FAILURE_CODES = new Set(['auth_failed', 'quota_exceeded', 'rejected', 'upload_failed', 'no_secret', 'invalid_credential']);

/**
 * The studio's last stage (KAN-232): send the assembled video to the project's Meta ad account video
 * library or its YouTube channel. Each destination says whether it can be used and, if not, why and
 * where to fix it; every export is listed with its outcome and a link to the uploaded video.
 */
export function ExportPanel({ orgId, projectId, briefId, video, destinations, exports, canExport, defaultTitle, defaultDescription, resourcesHref }: ExportPanelProps): React.ReactElement {
  const t = useTranslations('AdStudio');
  const router = useRouter();
  const [title, setTitle] = React.useState(defaultTitle.slice(0, 100));
  const [description, setDescription] = React.useState(defaultDescription.slice(0, 5000));
  const [privacy, setPrivacy] = React.useState<'private' | 'unlisted' | 'public'>('unlisted');
  const [pending, setPending] = React.useState<ExportDestinationId | null>(null);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const locale = useLocale();
  // Formatted in the browser only, in the viewer's own time zone, so server and client markup agree.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const formatWhen = (iso: string) => (mounted ? ` · ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))}` : '');

  async function exportTo(destination: ExportDestinationId): Promise<void> {
    if (!video) return;
    setPending(destination);
    setMessage(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.id, destination, title, description, ...(destination === 'youtube' ? { privacy } : {}) }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; reason?: string; reasons?: string[]; export?: ExportRow };
      if (body.export?.status === 'done') {
        setMessage({ tone: 'ok', text: t('exportDone', { destination: t(`exportDestination.${destination}`) }) });
      } else if (body.export?.status === 'failed') {
        setMessage({ tone: 'error', text: t(`exportFailure.${body.export.failureCode && FAILURE_CODES.has(body.export.failureCode) ? body.export.failureCode : 'upload_failed'}`) });
      } else if (body.error === 'export_unavailable' && body.reason) {
        setMessage({ tone: 'error', text: t(`exportUnavailable.${body.reason}`) });
      } else if (body.error === 'invalid_export') {
        setMessage({ tone: 'error', text: t('exportInvalid', { reasons: (body.reasons ?? []).join('; ') }) });
      } else if (body.error === 'video_not_ready') {
        setMessage({ tone: 'error', text: t('exportVideoNotReady') });
      } else {
        setMessage({ tone: 'error', text: t('errorGeneric') });
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="ad-studio-export-heading" data-testid="ad-studio-export">
      <header className="flex items-start gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Upload className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id="ad-studio-export-heading" className="text-lg font-semibold">
            {t('exportTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{video ? t('exportDescription', { seconds: Math.round(video.durationSeconds) }) : t('exportNeedsVideo')}</p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {DESTINATIONS.map((destination) => {
          const state = destinations[destination];
          return (
            <div
              key={destination}
              className={cn('flex flex-col gap-3 rounded-xl border p-4', state.available ? 'border-border' : 'border-dashed border-border bg-muted/30')}
              data-testid={`ad-studio-export-${destination}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{t(`exportDestination.${destination}`)}</p>
                  <p className="text-xs text-muted-foreground">{t(`exportDestinationHint.${destination}`)}</p>
                </div>
                {state.available ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    {t('exportConnected')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <CircleAlert className="h-3 w-3" aria-hidden="true" />
                    {t('exportNotConnected')}
                  </span>
                )}
              </div>
              {state.available ? (
                <p className="text-xs text-muted-foreground">{t('exportVia', { name: state.credentialName })}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t(`exportUnavailable.${state.reason}`)}{' '}
                  <Link href={resourcesHref} className="font-medium text-primary hover:underline">
                    {t('exportOpenResources')}
                  </Link>
                </p>
              )}
              {destination === 'youtube' && state.available ? (
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  {t('exportPrivacy')}
                  <select value={privacy} onChange={(event) => setPrivacy(event.target.value as typeof privacy)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground">
                    <option value="unlisted">{t('exportPrivacyUnlisted')}</option>
                    <option value="private">{t('exportPrivacyPrivate')}</option>
                    <option value="public">{t('exportPrivacyPublic')}</option>
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => exportTo(destination)}
                disabled={!canExport || !state.available || !video || pending !== null || title.trim().length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {pending === destination ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                {pending === destination ? t('exporting') : t('exportButton', { destination: t(`exportDestination.${destination}`) })}
              </button>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('exportVideoTitle')}
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} dir="auto" className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('exportVideoDescription')}
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={5000} dir="auto" className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground" />
        </label>
      </div>
      {!canExport ? <p className="text-xs text-muted-foreground">{t('exportNeedsPermission')}</p> : null}
      {message ? (
        <p role="status" className={message.tone === 'ok' ? 'text-sm text-success' : 'text-sm text-destructive'}>
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t('exportHistory')}</h3>
        {exports.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('exportHistoryEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {exports.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm" data-testid="ad-studio-export-row">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium" dir="auto">
                    {row.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`exportDestination.${row.destination}`)}
                    {row.privacy ? ` · ${t(`exportPrivacyShort.${row.privacy}`)}` : ''}
                    {formatWhen(row.requestedOn)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', row.status === 'done' ? 'bg-success/10 text-success' : row.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}>
                    {row.status === 'failed'
                      ? t(`exportFailure.${row.failureCode && FAILURE_CODES.has(row.failureCode) ? row.failureCode : 'upload_failed'}`)
                      : t(`exportStatus.${row.status}`)}
                  </span>
                  {row.externalUrl ? (
                    <a href={row.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      {t('exportOpen')}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
