'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { totalSceneSeconds, type AdStudioFormat } from '@growthos/shared';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Film,
  Globe,
  ImageIcon,
  Monitor,
  Plus,
  Search,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/components/viz';
import { cn } from '@/lib/utils';
import { AdFromSite } from './ad-from-site';
import { BriefForm } from './brief-form';
import { SceneTimeline } from './scene-timeline';

export type AdStudioBriefStageStatus = 'draft' | 'planned' | 'scripted';

export interface AdStudioListBrief {
  id: string;
  name: string;
  objective: string;
  format: AdStudioFormat;
  language: string;
  status: AdStudioBriefStageStatus | (string & {});
  host: string | null;
  scenes: Array<{ id: string; durationSeconds: number }>;
  hasPlan: boolean;
  imageConceptCount: number;
  hasSearchAd: boolean;
  keywordCount: number;
  lastChangedOn: string;
}

export interface AdStudioAdsHubProps {
  orgId: string;
  projectId: string;
  studioHref: string;
  knownSite: string | null;
  briefs: AdStudioListBrief[];
}

type StatusFilter = 'all' | AdStudioBriefStageStatus;

function normalizeBriefStatus(status: string): AdStudioBriefStageStatus {
  if (status === 'scripted' || status === 'planned') return status;
  return 'draft';
}

const STATUS_BADGE_CLASSES: Record<AdStudioBriefStageStatus, string> = {
  scripted: 'border-emerald-200/80 bg-emerald-50 text-emerald-900',
  planned: 'border-pp-primary-fixed bg-pp-primary-fixed text-pp-on-primary-fixed',
  draft: 'border-border/70 bg-pp-surface-container text-muted-foreground',
};

const STATUS_DOT_CLASSES: Record<AdStudioBriefStageStatus, string> = {
  scripted: 'bg-emerald-500',
  planned: 'bg-pp-primary',
  draft: 'bg-muted-foreground/60',
};

function formatBriefUpdatedDate(locale: string, iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(parsed));
}

function AdStudioBriefCard({
  brief,
  studioHref,
  locale,
}: {
  brief: AdStudioListBrief;
  studioHref: string;
  locale: string;
}): React.ReactElement {
  const t = useTranslations('AdStudio');
  const FormatIcon = brief.format === 'vertical' ? Smartphone : Monitor;
  const stageStatus = normalizeBriefStatus(brief.status);
  const totalSeconds = totalSceneSeconds(brief.scenes);
  const hasSearch = brief.hasSearchAd || brief.keywordCount > 0;
  const langLabel = brief.language === 'he' ? t('list.langHe') : t('list.langEn');
  const updatedLabel = formatBriefUpdatedDate(locale, brief.lastChangedOn);

  return (
    <Link
      href={`${studioHref}?brief=${brief.id}`}
      className="group flex min-w-0 flex-col gap-3 rounded-3xl border border-pp-outline-variant/40 bg-card p-4 shadow-pp-candy transition-all hover:border-pp-primary/45 hover:shadow-pp-candy-hover active:scale-[0.99]"
      data-testid="ad-studio-brief-card"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
            STATUS_BADGE_CLASSES[stageStatus],
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT_CLASSES[stageStatus])} aria-hidden="true" />
          {t(`status.${stageStatus}`)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-pp-surface-container px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          <FormatIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
          {t(brief.format === 'vertical' ? 'formatVerticalShort' : 'formatHorizontalShort')}
        </span>
        <span className="rounded-full bg-pp-surface-container px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
          {langLabel}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <p
          dir="auto"
          className="line-clamp-2 font-pp-display text-base font-bold leading-snug text-foreground transition-colors group-hover:text-pp-primary"
        >
          {brief.name}
        </p>
        {brief.objective ? (
          <p dir="auto" className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {brief.objective}
          </p>
        ) : null}
      </div>

      {brief.host ? (
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5 shrink-0 text-pp-primary" aria-hidden="true" />
          <span dir="ltr" className="truncate font-mono text-foreground/85">
            {brief.host}
          </span>
        </div>
      ) : null}

      {brief.hasPlan || brief.scenes.length > 0 || brief.imageConceptCount > 0 || hasSearch ? (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {brief.hasPlan ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-pp-surface-container px-2.5 py-1 text-[11px] font-medium text-pp-primary">
              <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              {t('list.chipPlan')}
            </span>
          ) : null}
          {brief.scenes.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-pp-surface-container-low px-2.5 py-1 text-[11px] font-medium text-foreground/85">
              <Film className="h-3 w-3 shrink-0 text-pp-primary" aria-hidden="true" />
              {t('stageScriptValue', { scenes: brief.scenes.length, seconds: totalSeconds })}
            </span>
          ) : null}
          {brief.imageConceptCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-pp-surface-container-low px-2.5 py-1 text-[11px] font-medium text-foreground/85">
              <ImageIcon className="h-3 w-3 shrink-0 text-pp-primary" aria-hidden="true" />
              {t('list.chipImages', { count: brief.imageConceptCount })}
            </span>
          ) : null}
          {hasSearch ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-pp-surface-container-low px-2.5 py-1 text-[11px] font-medium text-foreground/85">
              <Search className="h-3 w-3 shrink-0 text-pp-primary" aria-hidden="true" />
              {t('list.chipSearch')}
            </span>
          ) : null}
        </div>
      ) : null}

      {brief.scenes.length > 0 ? (
        <div className="rounded-2xl border border-pp-outline-variant/25 bg-pp-surface-container-low/80 p-2.5">
          <SceneTimeline scenes={brief.scenes} compact />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('noScenesYetShort')}</p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2.5 text-xs">
        <span className="text-muted-foreground tabular-nums">{t('list.updatedOn', { date: updatedLabel })}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-pp-primary">
          {t('list.openAd')}
          <ArrowRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

/**
 * Mobile-dedicated Ad Studio hub: puts existing ads front and center on phones with search,
 * stage filter pills, rich creative-mix cards, 1-tap website creation, and progressive disclosure
 * for manual entry so mobile users avoid form walls while desktop behavior stays intact.
 */
export function AdStudioAdsHub({
  orgId,
  projectId,
  studioHref,
  knownSite,
  briefs,
}: AdStudioAdsHubProps): React.ReactElement {
  const t = useTranslations('AdStudio');
  const locale = useLocale();
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [manualOpen, setManualOpen] = React.useState(false);

  const counts = React.useMemo(() => {
    const summary = { all: briefs.length, scripted: 0, planned: 0, draft: 0 };
    for (const brief of briefs) summary[normalizeBriefStatus(brief.status)] += 1;
    return summary;
  }, [briefs]);

  const filteredBriefs = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return briefs.filter((brief) => {
      if (statusFilter !== 'all' && normalizeBriefStatus(brief.status) !== statusFilter) return false;
      if (!normalized) return true;
      return (
        brief.name.toLowerCase().includes(normalized) ||
        brief.objective.toLowerCase().includes(normalized) ||
        (brief.host?.toLowerCase().includes(normalized) ?? false)
      );
    });
  }, [briefs, query, statusFilter]);

  function scrollToCreate(): void {
    document.getElementById('ad-studio-create-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetFilters(): void {
    setQuery('');
    setStatusFilter('all');
  }

  const filterOptions: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: t('list.filterAll') },
    { key: 'scripted', label: t('status.scripted') },
    { key: 'planned', label: t('status.planned') },
    { key: 'draft', label: t('status.draft') },
  ];

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-start">
      <section
        id="ad-studio-create-card"
        aria-labelledby="ad-studio-create-heading"
        className="relative min-w-0 overflow-hidden rounded-3xl border border-pp-outline-variant/40 bg-card p-4 shadow-pp-candy sm:p-5"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-pp-primary via-pp-primary-fixed-dim to-pp-secondary-container"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-col gap-4 pt-1">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pp-primary-fixed text-pp-primary">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="ad-studio-create-heading" className="font-pp-display text-lg font-bold tracking-tight text-foreground">
                {t('newAdTitle')}
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t('newAdDescription')}</p>
            </div>
          </div>

          <AdFromSite orgId={orgId} projectId={projectId} studioHref={studioHref} defaultSiteUrl={knownSite} />

          <button
            type="button"
            onClick={() => setManualOpen((current) => !current)}
            aria-expanded={manualOpen}
            aria-controls="ad-studio-manual-form-wrap"
            data-testid="ad-studio-manual-toggle"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-pp-outline-variant/50 bg-pp-surface-container-low px-4 py-2.5 text-xs font-semibold text-pp-primary transition-colors hover:bg-pp-primary-fixed md:hidden"
          >
            <span>{manualOpen ? t('list.manualWriteHide') : t('list.manualWriteExpand')}</span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', manualOpen && 'rotate-180')} aria-hidden="true" />
          </button>

          <p className="hidden text-center text-xs font-medium text-muted-foreground md:block">{t('fromSite.or')}</p>

          <div
            id="ad-studio-manual-form-wrap"
            data-testid="ad-studio-manual-form-wrap"
            className={cn('min-w-0', !manualOpen && 'max-md:hidden')}
          >
            <BriefForm orgId={orgId} projectId={projectId} studioHref={studioHref} />
          </div>
        </div>
      </section>

      <section
        className={cn('flex min-w-0 flex-col gap-3', briefs.length > 0 && 'order-first lg:order-none')}
        aria-labelledby="ad-studio-ads-heading"
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 id="ad-studio-ads-heading" className="font-pp-display text-lg font-bold tracking-tight text-foreground">
              {t('adsListTitle')}
            </h2>
            {briefs.length > 0 ? (
              <span className="rounded-full bg-pp-primary-fixed px-2.5 py-0.5 text-xs font-semibold tabular-nums text-pp-on-primary-fixed">
                {t('list.countBadge', { count: briefs.length })}
              </span>
            ) : null}
          </div>
          {briefs.length > 0 ? (
            <button
              type="button"
              onClick={scrollToCreate}
              data-testid="ad-studio-mobile-new-cta"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition-transform active:scale-95 md:hidden"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t('list.newAdShortcut')}
            </button>
          ) : null}
        </div>

        {briefs.length === 0 ? (
          <EmptyState icon={Clapperboard} title={t('adsListEmptyTitle')} description={t('adsListEmpty')} />
        ) : (
          <>
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="relative min-w-0">
                <label htmlFor="ad-studio-search-input" className="sr-only">
                  {t('list.searchLabel')}
                </label>
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="ad-studio-search-input"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('list.searchPlaceholder')}
                  className="h-10 w-full rounded-full border border-pp-outline-variant/45 bg-card ps-9 pe-9 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label={t('list.clearSearch')}
                    className="absolute end-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div
                role="group"
                aria-label={t('list.filterLabel')}
                className="flex min-w-0 max-w-full items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {filterOptions.map((option) => {
                  const active = statusFilter === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setStatusFilter(option.key)}
                      aria-pressed={active}
                      data-testid={`ad-studio-filter-${option.key}`}
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'border-pp-outline-variant/40 bg-pp-surface-container-low text-foreground/80 hover:bg-pp-primary-fixed',
                      )}
                    >
                      <span>{option.label}</span>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.2 text-[10px] tabular-nums',
                          active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-card text-muted-foreground',
                        )}
                      >
                        {counts[option.key]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredBriefs.length === 0 ? (
              <div
                className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-pp-outline-variant/60 bg-card/80 p-6 text-center"
                data-testid="ad-studio-no-matches"
              >
                <p className="font-pp-display text-sm font-bold text-foreground">{t('list.noMatchesTitle')}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t('list.noMatchesDescription')}</p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex h-9 items-center rounded-full border border-pp-primary/30 bg-pp-primary-fixed px-4 text-xs font-semibold text-pp-on-primary-fixed hover:bg-pp-primary/15"
                >
                  {t('list.resetFilters')}
                </button>
              </div>
            ) : (
              <ul className="flex min-w-0 flex-col gap-3">
                {filteredBriefs.map((brief) => (
                  <li key={brief.id} className="min-w-0">
                    <AdStudioBriefCard brief={brief} studioHref={studioHref} locale={locale} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
