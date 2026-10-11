'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { AdStudioAdCopy, AdStudioImageFormat, AdStudioMetaTargeting } from '@growthos/shared';
import { AdPlacementPreview, type AdPlacement, type AdPreviewMedia } from './ad-placement-preview';
import {
  CheckCircle2,
  ExternalLink,
  Film,
  ImageIcon,
  Loader2,
  Megaphone,
  Search,
} from 'lucide-react';
import { SearchResultPreview } from './search-result-preview';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

type Destination = 'meta' | 'google_ads';

export interface PublishCreative {
  key: string;
  kind: 'image' | 'video' | 'search';
  /** The image id, the assembled video id, or `search` for the search ad. */
  id: string;
  label: string;
  /** Media route for a preview (image) or poster-less video. */
  previewSrc: string;
  /** The creative's own ad copy (KAN-278); the form starts from it when the creative is picked. */
  copy?: AdStudioAdCopy | null;
  /** The image's placement format, for the live preview. */
  format?: AdStudioImageFormat;
  /** For the video: whether it is vertical. */
  vertical?: boolean;
  /** For the search ad: what is published - the ad and how many keywords it bids on. */
  search?: {
    headlines: string[];
    descriptions: string[];
    path1: string;
    path2: string;
    keywordCount: number;
  };
}

export interface PublishedAdRow {
  id: string;
  destination: string;
  mediaKind: 'video' | 'image' | 'search';
  title: string;
  status: 'uploading' | 'done' | 'failed';
  externalUrl: string | null;
  failureCode: string | null;
  failureDetail?: string | null;
  requestedOn: string;
}

export interface PublishPanelProps {
  orgId: string;
  projectId: string;
  briefId: string;
  briefName: string;
  defaultLink: string;
  defaultPrimaryText: string;
  creatives: PublishCreative[];
  destinations: Record<Destination, boolean>;
  canPublish: boolean;
  published: PublishedAdRow[];
  resourcesHref: string;
  /** The Meta audience planned for the ad; the Meta ad set targets it (countries can be changed here). */
  metaTargeting?: AdStudioMetaTargeting | null;
  /** Starts "Connect with Facebook" and comes back here; null when the viewer cannot connect accounts or no Meta app is configured. */
  metaConnectHref?: string | null;
}

/** The placements a published ad can run in on each platform (Google Ads takes images only). */
function placementsFor(
  destination: Destination,
  kind: 'image' | 'video' | 'search',
): AdPlacement[] {
  if (destination === 'google_ads') return ['google_display'];
  return kind === 'video'
    ? ['facebook_feed', 'instagram_story']
    : ['facebook_feed', 'instagram_feed', 'instagram_story'];
}

/** The feed preview of an image or the video (the search ad has its own). */
function previewMedia(creative: PublishCreative): AdPreviewMedia {
  return creative.kind === 'video'
    ? {
        kind: 'video',
        src: creative.previewSrc,
        vertical: creative.vertical ?? true,
        label: creative.label,
      }
    : {
        kind: 'image',
        byFormat: { [creative.format ?? 'square']: creative.previewSrc },
        alt: creative.label,
      };
}

const FAILURES = new Set([
  'auth_failed',
  'quota_exceeded',
  'rejected',
  'upload_failed',
  'no_secret',
  'invalid_credential',
  'account_action_required',
]);

/**
 * The stepper's last step: turn a finished creative into a real ad. The person picks an image (an
 * idea in one placement) or the video, a platform, and the ad's words, link and budget; the ad is
 * created PAUSED on Meta or Google Ads so it can be reviewed there before it spends, and every
 * created ad is listed with a link that opens it on the platform.
 */
export function PublishPanel(props: PublishPanelProps): React.ReactElement {
  const {
    orgId,
    projectId,
    briefId,
    briefName,
    creatives,
    destinations,
    canPublish,
    resourcesHref,
  } = props;
  const t = useTranslations('AdStudio');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const [selected, setSelected] = React.useState(creatives[0]?.key ?? '');
  const firstCopy = creatives[0]?.copy ?? null;
  const [destination, setDestination] = React.useState<Destination>('meta');
  const [campaignName, setCampaignName] = React.useState(briefName);
  const [headline, setHeadline] = React.useState(firstCopy?.headline || briefName.slice(0, 30));
  const [primaryText, setPrimaryText] = React.useState(
    firstCopy?.primaryText || props.defaultPrimaryText.slice(0, 90),
  );
  const [description, setDescription] = React.useState(firstCopy?.description ?? '');
  const [linkUrl, setLinkUrl] = React.useState(props.defaultLink);
  const [businessName, setBusinessName] = React.useState('');
  const [dailyBudget, setDailyBudget] = React.useState('20');
  const [countries, setCountries] = React.useState(
    props.metaTargeting?.countries.join(', ') || 'IL',
  );
  const [euPolitical, setEuPolitical] = React.useState<'' | 'yes' | 'no'>('');
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{
    tone: 'ok' | 'error';
    text: string;
    href?: string;
    detail?: string | null;
  } | null>(null);
  const [published, setPublished] = React.useState(props.published);
  React.useEffect(() => setPublished(props.published), [props.published]);

  const creative = creatives.find((entry) => entry.key === selected) ?? null;

  /** Picking a creative brings its own words into the form; one without copy keeps what is typed. */
  function choose(entry: PublishCreative): void {
    setSelected(entry.key);
    // A search ad runs on Google Search only.
    if (entry.kind === 'search') setDestination('google_ads');
    if (!entry.copy) return;
    setHeadline(entry.copy.headline);
    setPrimaryText(entry.copy.primaryText);
    setDescription(entry.copy.description);
  }
  const googleBlocked = destination === 'google_ads' && creative?.kind === 'video';
  const isSearch = creative?.kind === 'search';
  const metaBlocked = destination === 'meta' && isSearch;
  const missingEu = destination === 'google_ads' && euPolitical === '';

  async function publish(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!creative) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination,
            source:
              creative.kind === 'search'
                ? { kind: 'search' }
                : creative.kind === 'image'
                  ? { kind: 'image', imageId: creative.id }
                  : { kind: 'video', videoId: creative.id },
            campaignName,
            copy: { headline, primaryText, description, linkUrl, businessName },
            dailyBudget: Number(dailyBudget),
            countries: countries
              .split(/[\s,]+/)
              .map((code) => code.trim().toUpperCase())
              .filter(Boolean),
            ...(destination === 'google_ads' && euPolitical
              ? { containsEuPoliticalAdvertising: euPolitical === 'yes' }
              : {}),
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        ad?: PublishedAdRow;
        reason?: string;
        reasons?: string[];
      } & AdStudioApiError;
      if (body.ad) {
        setPublished((current) => [body.ad as PublishedAdRow, ...current]);
        setMessage(
          body.ad.status === 'done'
            ? {
                tone: 'ok',
                text: t('publish.done', { destination: t(`publish.destination.${destination}`) }),
                href: body.ad.externalUrl ?? undefined,
              }
            : {
                tone: 'error',
                text: t(
                  `exportFailure.${body.ad.failureCode && FAILURES.has(body.ad.failureCode) ? body.ad.failureCode : 'upload_failed'}`,
                ),
                detail: body.ad.failureDetail ?? null,
              },
        );
        router.refresh();
      } else if (body.error === 'export_unavailable' && body.reason) {
        setMessage({ tone: 'error', text: t(`exportUnavailable.${body.reason}`) });
      } else if (body.error === 'invalid_export') {
        setMessage({
          tone: 'error',
          text: t('publish.invalid', { reasons: (body.reasons ?? []).join('; ') }),
        });
      } else {
        setMessage({ tone: 'error', text: errorMessage(body) });
      }
    } finally {
      setPending(false);
    }
  }

  const input = 'h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground';

  return (
    <section
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm"
      aria-labelledby="ad-studio-publish-heading"
      data-testid="ad-studio-publish"
    >
      <header className="flex items-start gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Megaphone className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id="ad-studio-publish-heading" className="text-lg font-semibold">
            {t('publish.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('publish.description')}</p>
        </div>
      </header>

      {creatives.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('publish.nothingReady')}</p>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t('publish.chooseCreative')}</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {creatives.map((entry) => (
            <label
              key={entry.key}
              className={cn(
                'flex cursor-pointer flex-col gap-2 rounded-xl border p-2 text-xs',
                selected === entry.key
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-primary/40',
              )}
              data-testid={`ad-studio-publish-creative-${entry.key}`}
            >
              <input
                type="radio"
                name="publish-creative"
                value={entry.key}
                checked={selected === entry.key}
                onChange={() => choose(entry)}
                className="sr-only"
              />
              <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted">
                {entry.kind === 'search' ? (
                  <span className="flex flex-col items-center gap-1 p-2 text-center text-[11px] text-muted-foreground">
                    <Search className="h-6 w-6 text-primary" aria-hidden="true" />
                    {t('publish.searchKeywords', { count: entry.search?.keywordCount ?? 0 })}
                  </span>
                ) : entry.kind === 'image' ? (
                  // A plain img: private media served by our own authenticated route.
                  <img src={entry.previewSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video
                    src={entry.previewSrc}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                )}
              </span>
              <span className="flex min-w-0 items-center gap-1 font-medium">
                {entry.kind === 'search' ? (
                  <Search className="h-3 w-3 shrink-0" aria-hidden="true" />
                ) : entry.kind === 'image' ? (
                  <ImageIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                ) : (
                  <Film className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{entry.label}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <form className="flex flex-col gap-4" onSubmit={(event) => void publish(event)}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('publish.platform')}>
          {(['meta', 'google_ads'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              role="radio"
              aria-checked={destination === entry}
              onClick={() => setDestination(entry)}
              className={cn(
                'rounded-xl border px-4 py-2 text-sm font-semibold',
                destination === entry
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-muted',
              )}
            >
              {t(`publish.destination.${entry}`)}
              {!destinations[entry] ? (
                <span className="ms-2 text-[11px] font-normal text-muted-foreground">
                  {t('publish.notConnected')}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {googleBlocked ? <p className="text-xs text-warning">{t('publish.googleVideo')}</p> : null}
        {metaBlocked ? (
          <p className="text-xs text-warning">{t('publish.searchGoogleOnly')}</p>
        ) : null}
        {destination === 'meta' && !isSearch ? (
          <p className="text-xs text-muted-foreground" data-testid="ad-studio-publish-audience">
            {props.metaTargeting
              ? t('publish.audiencePlanned', {
                  ages: `${props.metaTargeting.ageMin}-${props.metaTargeting.ageMax}${props.metaTargeting.ageMax === 65 ? '+' : ''}`,
                  genders: t(
                    `audience.genders.${props.metaTargeting.genders.length === 1 ? props.metaTargeting.genders[0] : 'all'}`,
                  ),
                  audiences: props.metaTargeting.customAudiences.length,
                  interests: props.metaTargeting.interests.length,
                })
              : t('publish.audienceBroad')}
          </p>
        ) : null}
        {isSearch && destination === 'google_ads' ? (
          <p className="text-xs text-muted-foreground">{t('publish.searchNote')}</p>
        ) : null}
        {!destinations[destination] ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {t('publish.connectFirst')}
            {destination === 'meta' && props.metaConnectHref ? (
              <a
                href={props.metaConnectHref}
                className="inline-flex items-center rounded-lg bg-[#1877F2] px-3 py-1.5 font-semibold text-white hover:bg-[#166fe0]"
                data-testid="ad-studio-connect-meta"
              >
                {t('publish.connectMeta')}
              </a>
            ) : (
              <a href={resourcesHref} className="font-medium text-primary hover:underline">
                {t('exportOpenResources')}
              </a>
            )}
          </p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('publish.campaignName')}
            <input
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              maxLength={120}
              dir="auto"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('publish.link')}
            <input
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              dir="ltr"
              placeholder="https://"
              className={input}
            />
          </label>
          {!isSearch ? (
            <>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                {t('publish.headline')}
                <input
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                  maxLength={destination === 'google_ads' ? 30 : 40}
                  dir="auto"
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                {t('publish.primaryText')}
                <input
                  value={primaryText}
                  onChange={(event) => setPrimaryText(event.target.value)}
                  maxLength={destination === 'google_ads' ? 90 : 500}
                  dir="auto"
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                {t('publish.descriptionLabel')}
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={90}
                  dir="auto"
                  className={input}
                />
              </label>
            </>
          ) : null}
          {isSearch ? null : destination === 'google_ads' ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('publish.businessName')}
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                maxLength={25}
                dir="auto"
                className={input}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('publish.countries')}
              <input
                value={countries}
                onChange={(event) => setCountries(event.target.value)}
                dir="ltr"
                className={input}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('publish.dailyBudget')}
            <input
              type="number"
              min={1}
              value={dailyBudget}
              onChange={(event) => setDailyBudget(event.target.value)}
              className={input}
            />
          </label>
        </div>
        {creative?.kind === 'search' && creative.search ? (
          <div
            className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3"
            data-testid="ad-studio-publish-preview"
          >
            <span className="text-sm font-semibold">{t('publish.previewTitle')}</span>
            <SearchResultPreview {...creative.search} linkUrl={linkUrl} advertiser={briefName} />
          </div>
        ) : creative && !googleBlocked ? (
          <div
            className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3"
            data-testid="ad-studio-publish-preview"
          >
            <span className="text-sm font-semibold">{t('publish.previewTitle')}</span>
            <AdPlacementPreview
              key={`${destination}-${creative.key}`}
              copy={{ headline, primaryText, description }}
              media={previewMedia(creative)}
              advertiser={
                destination === 'google_ads' && businessName.trim() ? businessName : briefName
              }
              linkUrl={linkUrl}
              placements={placementsFor(destination, creative.kind)}
            />
          </div>
        ) : null}
        {destination === 'google_ads' ? (
          <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">{t('publish.euLegend')}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="publish-eu"
                  checked={euPolitical === 'no'}
                  onChange={() => setEuPolitical('no')}
                />
                {t('publish.euNo')}
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="publish-eu"
                  checked={euPolitical === 'yes'}
                  onChange={() => setEuPolitical('yes')}
                />
                {t('publish.euYes')}
              </label>
            </div>
          </fieldset>
        ) : null}
        <p className="text-xs text-muted-foreground">{t('publish.pausedNote')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={
              pending ||
              !creative ||
              !canPublish ||
              !destinations[destination] ||
              googleBlocked ||
              metaBlocked ||
              missingEu
            }
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Megaphone className="h-4 w-4" aria-hidden="true" />
            )}
            {t('publish.create', { destination: t(`publish.destination.${destination}`) })}
          </button>
          {!canPublish ? (
            <span className="text-xs text-muted-foreground">{t('exportNeedsPermission')}</span>
          ) : null}
        </div>
      </form>
      {message ? (
        <p
          role="status"
          className={cn(
            'flex flex-wrap items-center gap-2 text-sm',
            message.tone === 'ok' ? 'text-success' : 'text-destructive',
          )}
        >
          {message.text}
          {message.detail ? (
            <span
              className="basis-full rounded-lg bg-destructive/5 px-3 py-2 text-xs text-foreground"
              dir="auto"
              data-testid="ad-studio-publish-detail"
            >
              {t('publish.platformSaid', { detail: message.detail })}
            </span>
          ) : null}
          {message.href ? (
            <a
              href={message.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline"
            >
              {t('publish.openAd')}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t('publish.history')}</h3>
        {published.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('publish.historyEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {published.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                data-testid="ad-studio-published-ad"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {row.status === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  ) : null}
                  <span className="truncate font-medium" dir="auto">
                    {row.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(
                      `publish.destination.${row.destination === 'google_ads' ? 'google_ads' : 'meta'}`,
                    )}{' '}
                    ·{' '}
                    {t(
                      row.mediaKind === 'video'
                        ? 'publish.kindVideo'
                        : row.mediaKind === 'search'
                          ? 'publish.kindSearch'
                          : 'publish.kindImage',
                    )}
                  </span>
                </span>
                {row.externalUrl ? (
                  <a
                    href={row.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {t('publish.openAd')}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : (
                  <span
                    className="text-xs text-destructive"
                    dir="auto"
                    title={row.failureDetail ?? undefined}
                  >
                    {t(
                      `exportFailure.${row.failureCode && FAILURES.has(row.failureCode) ? row.failureCode : 'upload_failed'}`,
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
