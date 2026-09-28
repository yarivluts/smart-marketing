'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Settings2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { limitUsedPercent } from '@/lib/ad-studio/view';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface AdStudioUsageRow {
  id: string;
  kind: string;
  provider: string;
  model: string;
  units: number;
  outcome: 'succeeded' | 'failed';
  failureReason: string | null;
  occurredOn: string;
}

export interface AdStudioAdminPanelProps {
  orgId: string;
  projectId: string;
  canConfigure: boolean;
  textModel: { provider: 'anthropic' | 'gemini'; model: string } | null;
  videoConfigured: boolean;
  /** Whether deep analysis can read Google Ads keyword volumes for this project, and why not (KAN-230). */
  keywordData: { available: true; credentialName: string } | { available: false; reason: 'no_google_ads_credential' | 'credential_not_configured' | 'vault_not_configured' };
  /** Where clips and videos are stored (KAN-231); omitted by callers that predate it. */
  storage?: { kind: 'gcs' | 'local' | 'memory'; location: string };
  /** Whether ffmpeg runs on this server, which assembling a video needs. */
  ffmpegAvailable?: boolean;
  limits: { dailyTextGenerations: number; dailyVideoSeconds: number; dailyImages: number };
  usageToday: { textGenerations: number; videoSeconds: number; images: number };
  recentUsage: AdStudioUsageRow[];
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }): React.ReactElement {
  const percent = limitUsedPercent(used, limit);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">
          {used}/{limit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn('h-full rounded-full', percent >= 100 ? 'bg-destructive' : percent >= 80 ? 'bg-warning' : 'bg-primary')} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/**
 * The studio's admin surface: which models it uses, whether deep analysis has Google Ads keyword
 * data and why not, the project's daily limits (editable with `project.configure`, audited
 * server-side), today's usage against them and the recent AI calls with their outcome - so spend and
 * failures such as a provider out of credit are visible, not guessed.
 */
export function AdStudioAdminPanel({
  orgId,
  projectId,
  canConfigure,
  textModel,
  videoConfigured,
  keywordData,
  storage,
  ffmpegAvailable,
  limits,
  usageToday,
  recentUsage,
}: AdStudioAdminPanelProps): React.ReactElement {
  const t = useTranslations('AdStudio');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const [text, setText] = React.useState(String(limits.dailyTextGenerations));
  const [video, setVideo] = React.useState(String(limits.dailyVideoSeconds));
  const [imagesLimit, setImagesLimit] = React.useState(String(limits.dailyImages));
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const locale = useLocale();
  // Formatted in the browser only, in the viewer's own time zone, so server and client markup agree.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const formatWhen = (iso: string) => (mounted ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '');

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ad-studio/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyTextGenerations: Number(text), dailyVideoSeconds: Number(video), dailyImages: Number(imagesLimit) }),
      });
      const body = (await response.json().catch(() => ({}))) as AdStudioApiError;
      if (!response.ok) {
        setMessage({ tone: 'error', text: errorMessage(body) });
        return;
      }
      setMessage({ tone: 'ok', text: t('limitsSaved') });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="ad-studio-admin-heading" data-testid="ad-studio-admin">
      <header className="flex items-start gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Settings2 className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id="ad-studio-admin-heading" className="text-base font-semibold">
            {t('adminTitle')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('adminDescription')}</p>
        </div>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">{t('textModel')}</dt>
          <dd className={cn('text-sm font-medium', !textModel && 'text-destructive')} dir="ltr">
            {textModel ? t('textModelValue', { provider: t(`providerName.${textModel.provider}`), model: textModel.model }) : t('notConfigured')}
          </dd>
        </div>
        <div className="rounded-xl border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">{t('videoModel')}</dt>
          <dd className={cn('text-sm font-medium', !videoConfigured && 'text-destructive')}>{videoConfigured ? t('videoModelValue') : t('notConfigured')}</dd>
        </div>
        {storage ? (
          <div className="rounded-xl border border-border px-3 py-2" data-testid="ad-studio-admin-storage">
            <dt className="text-xs text-muted-foreground">{t('storage')}</dt>
            <dd className="text-sm font-medium" dir="auto">
              {storage.kind === 'gcs' ? t('storageGcs', { location: storage.location }) : storage.kind === 'local' ? t('storageLocal') : t('storageMemory')}
            </dd>
          </div>
        ) : null}
        {ffmpegAvailable !== undefined ? (
          <div className="rounded-xl border border-border px-3 py-2" data-testid="ad-studio-admin-ffmpeg">
            <dt className="text-xs text-muted-foreground">{t('ffmpeg')}</dt>
            <dd className={cn('text-sm font-medium', ffmpegAvailable ? 'text-success' : 'text-destructive')}>{ffmpegAvailable ? t('ffmpegReady') : t('ffmpegMissing')}</dd>
          </div>
        ) : null}
        <div className="rounded-xl border border-border px-3 py-2 sm:col-span-2" data-testid="ad-studio-keyword-data">
          <dt className="text-xs text-muted-foreground">{t('keywordData')}</dt>
          <dd className={cn('text-sm font-medium', !keywordData.available && 'text-warning')}>
            {keywordData.available ? t('keywordDataValue', { credential: keywordData.credentialName }) : t(`keywordDataMissing.${keywordData.reason}`)}
          </dd>
          <p className="mt-1 text-xs text-muted-foreground">{t('planningAdminHint')}</p>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-3">
        <UsageBar label={t('usageTodayText')} used={usageToday.textGenerations} limit={limits.dailyTextGenerations} />
        <UsageBar label={t('usageTodayVideo')} used={usageToday.videoSeconds} limit={limits.dailyVideoSeconds} />
        <UsageBar label={t('usageTodayImages')} used={usageToday.images} limit={limits.dailyImages} />
      </div>

      {canConfigure ? (
        <form method="post" onSubmit={save} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('dailyText')}
            <input type="number" min={0} max={1000} value={text} onChange={(event) => setText(event.target.value)} className="h-9 w-32 rounded-lg border border-input bg-background px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('dailyVideo')}
            <input type="number" min={0} max={3600} value={video} onChange={(event) => setVideo(event.target.value)} className="h-9 w-32 rounded-lg border border-input bg-background px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('dailyImages')}
            <input type="number" min={0} max={500} value={imagesLimit} onChange={(event) => setImagesLimit(event.target.value)} className="h-9 w-32 rounded-lg border border-input bg-background px-2 text-sm" />
          </label>
          <button type="submit" disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t('saveLimits')}
          </button>
          {message ? (
            <span role="status" className={message.tone === 'ok' ? 'text-sm text-success' : 'text-sm text-destructive'}>
              {message.text}
            </span>
          ) : null}
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">{t('readOnlyLimits')}</p>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t('recentUsage')}</h3>
        {recentUsage.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('usageEmpty')}</p>
        ) : (
          <div className="max-h-64 overflow-auto rounded-xl border border-border">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="sticky top-0 bg-muted px-3 py-1.5 text-start font-medium">{t('usageWhen')}</th>
                  <th className="sticky top-0 bg-muted px-3 py-1.5 text-start font-medium">{t('usageWhat')}</th>
                  <th className="sticky top-0 bg-muted px-3 py-1.5 text-start font-medium">{t('usageModel')}</th>
                  <th className="sticky top-0 bg-muted px-3 py-1.5 text-start font-medium">{t('usageResult')}</th>
                </tr>
              </thead>
              <tbody>
                {recentUsage.map((row) => (
                  <tr key={row.id} className="border-t border-border" data-testid="ad-studio-usage-row">
                    <td className="px-3 py-1.5 tabular-nums">{formatWhen(row.occurredOn)}</td>
                    <td className="px-3 py-1.5">
                      {t(`usageKind.${row.kind}`)}
                      {row.kind === 'video_scene' || row.kind === 'video_edit' ? <span className="text-muted-foreground tabular-nums">{` · ${t('secondsShort', { seconds: row.units })}`}</span> : null}
                    </td>
                    <td className="px-3 py-1.5" dir="ltr">
                      {row.model}
                    </td>
                    <td className={cn('px-3 py-1.5', row.outcome === 'failed' ? 'text-destructive' : 'text-success')}>
                      {row.outcome === 'failed' && row.failureReason ? t(`providerErrors.${row.failureReason}`) : t(`usageOutcome.${row.outcome}`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
