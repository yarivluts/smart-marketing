'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Settings2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { limitUsedPercent } from '@/lib/ad-studio/view';
import { useLocalDateTime } from './use-local-date-time';

const SHORT = { dateStyle: 'short', timeStyle: 'short' } as const;
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
  /**
   * A GrowthOS platform operator (KAN-363): sees the infrastructure (models, storage, ffmpeg) and
   * sets the daily limits. A customer sees only the limits' source and the recent AI calls.
   */
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
  /** The AI quality check of rendered clips: on or off, and automatic re-renders per scene. */
  videoQa?: { enabled: boolean; retries: number };
  /** The size images are rendered at; omitted by callers that predate it (2K). */
  imageSize?: '1K' | '2K';
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
 * The studio's settings card. For a customer: whether deep analysis has Google Ads keyword data and
 * why not, that the daily limits come from their plan, and the recent AI calls with their outcome -
 * so failures such as a provider out of credit are visible, not guessed. For a GrowthOS platform
 * operator (KAN-363) also the models, storage and ffmpeg, today's usage against the limits, and the
 * form that sets them (audited server-side). Customers already see usage in the page's KPIs.
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
  videoQa = { enabled: true, retries: 1 },
  imageSize = '2K',
  usageToday,
  recentUsage,
}: AdStudioAdminPanelProps): React.ReactElement {
  const t = useTranslations('AdStudio');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const [text, setText] = React.useState(String(limits.dailyTextGenerations));
  const [video, setVideo] = React.useState(String(limits.dailyVideoSeconds));
  const [imagesLimit, setImagesLimit] = React.useState(String(limits.dailyImages));
  const [qaEnabled, setQaEnabled] = React.useState(videoQa.enabled);
  const [qaRetries, setQaRetries] = React.useState(String(videoQa.retries));
  const [size, setSize] = React.useState<'1K' | '2K'>(imageSize);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const formatWhen = useLocalDateTime(SHORT);

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ad-studio/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyTextGenerations: Number(text),
          dailyVideoSeconds: Number(video),
          dailyImages: Number(imagesLimit),
          videoQa: { enabled: qaEnabled, retries: Number(qaRetries) },
          imageSize: size,
        }),
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
          <p className="text-xs text-muted-foreground">{canConfigure ? t('adminDescription') : t('admin.customerDescription')}</p>
        </div>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2">
        {canConfigure ? (
          <div className="rounded-xl border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{t('textModel')}</dt>
            <dd className={cn('text-sm font-medium', !textModel && 'text-destructive')} dir="ltr">
              {textModel ? t('textModelValue', { provider: t(`providerName.${textModel.provider}`), model: textModel.model }) : t('notConfigured')}
            </dd>
          </div>
        ) : null}
        {canConfigure ? (
          <div className="rounded-xl border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{t('videoModel')}</dt>
            <dd className={cn('text-sm font-medium', !videoConfigured && 'text-destructive')}>{videoConfigured ? t('videoModelValue') : t('notConfigured')}</dd>
          </div>
        ) : null}
        {canConfigure && storage ? (
          <div className="rounded-xl border border-border px-3 py-2" data-testid="ad-studio-admin-storage">
            <dt className="text-xs text-muted-foreground">{t('storage')}</dt>
            <dd className="text-sm font-medium" dir="auto">
              {storage.kind === 'gcs' ? t('storageGcs', { location: storage.location }) : storage.kind === 'local' ? t('storageLocal') : t('storageMemory')}
            </dd>
          </div>
        ) : null}
        {canConfigure && ffmpegAvailable !== undefined ? (
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
          <dd className="mt-1 text-xs text-muted-foreground">{t('planningAdminHint')}</dd>
        </div>
      </dl>

      {canConfigure ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <UsageBar label={t('usageTodayText')} used={usageToday.textGenerations} limit={limits.dailyTextGenerations} />
          <UsageBar label={t('usageTodayVideo')} used={usageToday.videoSeconds} limit={limits.dailyVideoSeconds} />
          <UsageBar label={t('usageTodayImages')} used={usageToday.images} limit={limits.dailyImages} />
        </div>
      ) : null}

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
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('admin.imageSize')}
            <select value={size} onChange={(event) => setSize(event.target.value === '1K' ? '1K' : '2K')} className="h-9 w-48 rounded-lg border border-input bg-background px-2 text-sm" data-testid="ad-studio-image-size">
              {(['2K', '1K'] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`admin.imageSizes.${value}`)}
                </option>
              ))}
            </select>
            <span className="max-w-xs font-normal">{t('admin.imageSizeHint')}</span>
          </label>
          <fieldset className="flex basis-full flex-col gap-2 rounded-lg border border-border p-3" data-testid="ad-studio-qa-settings">
            <legend className="px-1 text-sm font-semibold">{t('admin.qaTitle')}</legend>
            <p className="text-xs text-muted-foreground">{t('admin.qaDescription')}</p>
            <div className="flex flex-wrap items-end gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={qaEnabled} onChange={(event) => setQaEnabled(event.target.checked)} />
                {t('admin.qaEnabled')}
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                {t('admin.qaRetries')}
                <select value={qaRetries} onChange={(event) => setQaRetries(event.target.value)} disabled={!qaEnabled} className="h-9 w-24 rounded-lg border border-input bg-background px-2 text-sm">
                  {['0', '1', '2'].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">{t('admin.qaRetriesImagesHint')}</p>
          </fieldset>
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
        <h3 id="ad-studio-recent-usage" className="text-sm font-semibold">{t('recentUsage')}</h3>
        {recentUsage.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('usageEmpty')}</p>
        ) : (
          <>
          {/* Phones: one card per call, so dates and model ids don't wrap mid-value (KAN-343). */}
          <ul className="flex max-h-80 flex-col gap-2 overflow-auto sm:hidden" data-testid="ad-studio-usage-cards">
            {recentUsage.map((row) => (
              <li key={row.id} className="flex flex-col gap-0.5 rounded-xl border border-border px-3 py-2 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {t(`usageKind.${row.kind}`)}
                    {row.kind === 'video_scene' || row.kind === 'video_edit' ? <span className="text-muted-foreground tabular-nums">{` · ${t('secondsShort', { seconds: row.units })}`}</span> : null}
                  </span>
                  <bdi className="shrink-0 whitespace-nowrap text-muted-foreground tabular-nums" dir="ltr">
                    {formatWhen(row.occurredOn)}
                  </bdi>
                </div>
                <span className={row.outcome === 'failed' ? 'text-destructive' : 'text-success'}>
                  {row.outcome === 'failed' && row.failureReason ? t(`providerErrors.${row.failureReason}`) : t(`usageOutcome.${row.outcome}`)}
                </span>
                {canConfigure ? (
                  <span className="break-all text-muted-foreground" dir="ltr">
                    {row.model}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {/* Scrolls on its own, so it takes keyboard focus to scroll without a mouse. */}
          <div className="hidden max-h-64 overflow-auto rounded-xl border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:block" tabIndex={0} role="region" aria-labelledby="ad-studio-recent-usage">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="sticky top-0 bg-muted px-3 py-1.5 text-start font-medium">{t('usageWhen')}</th>
                  <th className="sticky top-0 bg-muted px-3 py-1.5 text-start font-medium">{t('usageWhat')}</th>
                  {canConfigure ? <th className="sticky top-0 bg-muted px-3 py-1.5 text-start font-medium">{t('usageModel')}</th> : null}
                  <th className="sticky top-0 bg-muted px-3 py-1.5 text-start font-medium">{t('usageResult')}</th>
                </tr>
              </thead>
              <tbody>
                {recentUsage.map((row) => (
                  <tr key={row.id} className="border-t border-border" data-testid="ad-studio-usage-row">
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                      <bdi dir="ltr">{formatWhen(row.occurredOn)}</bdi>
                    </td>
                    <td className="px-3 py-1.5">
                      {t(`usageKind.${row.kind}`)}
                      {row.kind === 'video_scene' || row.kind === 'video_edit' ? <span className="text-muted-foreground tabular-nums">{` · ${t('secondsShort', { seconds: row.units })}`}</span> : null}
                    </td>
                    {canConfigure ? (
                      <td className="px-3 py-1.5" dir="ltr">
                        {row.model}
                      </td>
                    ) : null}
                    <td className={cn('px-3 py-1.5', row.outcome === 'failed' ? 'text-destructive' : 'text-success')}>
                      {row.outcome === 'failed' && row.failureReason ? t(`providerErrors.${row.failureReason}`) : t(`usageOutcome.${row.outcome}`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </section>
  );
}
