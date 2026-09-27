'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart3, CheckCircle2, Globe, Lightbulb, ListChecks, Loader2, Megaphone, Percent, Search, Sparkles, Telescope, XCircle } from 'lucide-react';
import type { AdStudioCitationSource, AdStudioPlan, AdStudioPlanSources } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { planningSourceChecklist, shortUrl, sortRecommendations } from '@/lib/ad-studio/view';
import { BarList, ChartCard, EmptyState, SERIES_COLORS } from '@/components/viz';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface PlanningPanelProps {
  orgId: string;
  projectId: string;
  briefId: string;
  plan: AdStudioPlan | null;
  sources: AdStudioPlanSources | null;
  generatedBy: { model: string; generatedAt: string } | null;
  /** False when no text model is configured for the deployment. */
  aiAvailable: boolean;
}

const MAX_BARS = 8;

type Translate = ReturnType<typeof useTranslations>;

function reasonText(t: Translate, source: string, reason: string): string {
  return t(`plan.reasons.${source}.${reason}`);
}

function Chip({ children, tone = 'muted', className }: { children: React.ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'error' | 'primary'; className?: string }): React.ReactElement {
  const tones = {
    muted: 'border-border bg-muted/50 text-muted-foreground',
    ok: 'border-success/30 bg-success/10 text-success',
    warn: 'border-warning/40 bg-warning/10 text-warning',
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
    primary: 'border-primary/30 bg-primary/10 text-primary',
  } as const;
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>;
}

const PRIORITY_TONE = { high: 'error', medium: 'warn', low: 'muted' } as const;
const COMPETITION_TONE = { LOW: 'ok', MEDIUM: 'warn', HIGH: 'error' } as const;

function SourcesChecklist({ sources }: { sources: AdStudioPlanSources }): React.ReactElement {
  const t = useTranslations('AdStudio');
  return (
    <ChartCard title={t('plan.sourcesTitle')} description={t('plan.sourcesDescription')} icon={ListChecks} className="min-w-0 lg:self-start">
      <ul className="flex flex-col gap-2" data-testid="ad-studio-plan-sources">
        {planningSourceChecklist(sources).map((row) => (
          <li key={row.id} className="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2" data-source={row.id} data-status={row.status}>
            {row.status === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            ) : row.status === 'model' ? (
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{t(`plan.source.${row.id}`)}</span>
                <Chip tone={row.status === 'ok' ? 'ok' : row.status === 'model' ? 'primary' : 'muted'}>
                  {t(row.status === 'ok' ? 'plan.sourceOk' : row.status === 'model' ? 'plan.sourceModel' : 'plan.sourceUnavailable')}
                </Chip>
              </div>
              {row.reason ? <p className="text-xs text-muted-foreground">{reasonText(t, row.id, row.reason)}</p> : null}
              {row.status === 'model' ? <p className="text-xs text-muted-foreground">{t('plan.marketHint')}</p> : null}
              {row.id === 'landing_page' && sources.landingPage.status === 'ok' ? (
                <p className="truncate text-xs text-muted-foreground">
                  {t('plan.landingPageRead', { url: shortUrl(sources.landingPage.url) })}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

function Unavailable({ source, reason }: { source: string; reason: string }): React.ReactElement {
  const t = useTranslations('AdStudio');
  return <EmptyState compact title={t(`plan.source.${source}`)} description={t('plan.unavailableChart', { reason: reasonText(t, source, reason) })} />;
}

function EvidenceCharts({ sources }: { sources: AdStudioPlanSources }): React.ReactElement {
  const t = useTranslations('AdStudio');
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const rate = (value: number | null) => (value === null ? t('plan.noRate') : percent.format(value));
  const more = (count: number) => t('plan.more', { count });
  const { results, keywords, campaigns } = sources;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <ChartCard
        title={t('plan.pagesChartTitle')}
        description={results.status === 'ok' ? t('plan.pagesChartDescription', { days: results.days, environment: results.environmentName }) : undefined}
        icon={BarChart3}
        footer={
          results.status === 'ok'
            ? t('plan.totals', { visitors: number.format(results.totals.visitors), conversions: number.format(results.totals.conversions), rate: rate(results.totals.conversionRate) })
            : undefined
        }
      >
        {results.status === 'ok' ? (
          <BarList
            maxItems={MAX_BARS}
            moreLabel={more}
            valueFormatter={(value) => number.format(value)}
            items={results.landingPages.map((row) => ({
              key: row.key,
              label: shortUrl(row.key),
              value: row.visitors,
              sublabel: t('plan.pageSublabel', { conversions: number.format(row.conversions), rate: rate(row.conversionRate) }),
            }))}
          />
        ) : (
          <Unavailable source="results" reason={results.reason} />
        )}
      </ChartCard>

      <ChartCard title={t('plan.campaignsRateTitle')} description={results.status === 'ok' ? t('plan.campaignsRateDescription') : undefined} icon={Percent}>
        {results.status === 'ok' ? (
          <BarList
            maxItems={MAX_BARS}
            moreLabel={more}
            color={SERIES_COLORS[2]}
            valueFormatter={(value) => percent.format(value)}
            items={results.campaigns
              .filter((row) => row.conversionRate !== null)
              .map((row) => ({
                key: row.key,
                label: row.key,
                value: row.conversionRate ?? 0,
                sublabel: t('plan.campaignRateSublabel', { visitors: number.format(row.visitors), conversions: number.format(row.conversions) }),
              }))}
          />
        ) : (
          <Unavailable source="results" reason={results.reason} />
        )}
      </ChartCard>

      <ChartCard title={t('plan.keywordsChartTitle')} description={keywords.status === 'ok' ? t('plan.keywordsChartDescription') : undefined} icon={Search}>
        {keywords.status === 'ok' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5" data-testid="ad-studio-keyword-competition">
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => {
                const count = keywords.ideas.filter((idea) => idea.competition === level).length;
                return count > 0 ? (
                  <Chip key={level} tone={COMPETITION_TONE[level]}>
                    {t(`plan.competition.${level}`)} · {number.format(count)}
                  </Chip>
                ) : null;
              })}
            </div>
            <BarList
              maxItems={MAX_BARS}
              moreLabel={more}
              color={SERIES_COLORS[1]}
              valueFormatter={(value) => (value < 0 ? t('plan.volumeUnknown') : number.format(value))}
              items={keywords.ideas.map((idea) => {
                const competition = t(`plan.competition.${idea.competition ?? 'unknown'}`);
                return {
                  key: idea.keyword,
                  label: idea.keyword,
                  value: idea.avgMonthlySearches ?? -1,
                  sublabel:
                    idea.lowTopOfPageBid !== null && idea.highTopOfPageBid !== null
                      ? t('plan.keywordSublabelBid', { competition, low: money.format(idea.lowTopOfPageBid), high: money.format(idea.highTopOfPageBid) })
                      : t('plan.keywordSublabel', { competition }),
                };
              })}
            />
          </div>
        ) : (
          <Unavailable source="keywords" reason={keywords.reason} />
        )}
      </ChartCard>

      <ChartCard title={t('plan.campaignsTitle')} description={campaigns.status === 'ok' ? t('plan.campaignsDescription') : undefined} icon={Megaphone}>
        {campaigns.status === 'ok' ? (
          <BarList
            maxItems={MAX_BARS}
            moreLabel={more}
            color={SERIES_COLORS[3]}
            valueFormatter={(value) => money.format(value)}
            items={campaigns.campaigns.map((campaign, index) => ({
              key: `${campaign.label}-${index}`,
              label: campaign.label,
              value: campaign.dailyBudgetUsd ?? 0,
              sublabel: t('plan.campaignSublabel', {
                platform: t(`plan.platform.${campaign.platform ?? 'unknown'}`),
                status: t(`plan.campaignStatus.${campaign.status ?? 'unknown'}`),
                ads: campaign.ads.length,
              }),
            }))}
          />
        ) : (
          <Unavailable source="campaigns" reason={campaigns.reason} />
        )}
      </ChartCard>
    </div>
  );
}

function PlanBody({ plan }: { plan: AdStudioPlan }): React.ReactElement {
  const t = useTranslations('AdStudio');
  const sourceLabel = (source: AdStudioCitationSource) => t(`plan.source.${source}`);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ChartCard title={t('plan.summaryTitle')} icon={Sparkles}>
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed" dir="auto">
            {plan.summary}
          </p>
          <dl className="grid gap-3 md:grid-cols-2">
            {plan.audience ? (
              <div className="rounded-xl border border-border px-3 py-2">
                <dt className="text-xs font-medium text-muted-foreground">{t('plan.audience')}</dt>
                <dd className="text-sm" dir="auto">
                  {plan.audience}
                </dd>
              </div>
            ) : null}
            {plan.landingPageSummary ? (
              <div className="rounded-xl border border-border px-3 py-2">
                <dt className="text-xs font-medium text-muted-foreground">{t('plan.landingPageSummary')}</dt>
                <dd className="text-sm" dir="auto">
                  {plan.landingPageSummary}
                </dd>
              </div>
            ) : null}
          </dl>
          {plan.messagingAngles.length ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">{t('plan.anglesTitle')}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {plan.messagingAngles.map((angle) => (
                  <li key={angle}>
                    <Chip tone="primary">
                      <span dir="auto">{angle}</span>
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.keywordThemes.length ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">{t('plan.themesTitle')}</h3>
              <ul className="grid gap-2 md:grid-cols-2">
                {plan.keywordThemes.map((theme) => (
                  <li key={theme.theme} className="rounded-xl border border-border px-3 py-2">
                    <p className="text-sm font-medium" dir="auto">
                      {theme.theme}
                    </p>
                    {theme.keywords.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {theme.keywords.map((keyword) => (
                          <Chip key={keyword}>
                            <span dir="auto">{keyword}</span>
                          </Chip>
                        ))}
                      </div>
                    ) : null}
                    {theme.evidence ? (
                      <p className="mt-1 text-xs text-muted-foreground" dir="auto">
                        {theme.evidence}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </ChartCard>

      <ChartCard title={t('plan.recommendationsTitle')} description={t('plan.recommendationsDescription')} icon={Lightbulb}>
        <ol className="grid gap-3 md:grid-cols-2" data-testid="ad-studio-plan-recommendations">
          {sortRecommendations(plan.recommendations).map((recommendation, index) => (
            <li key={`${recommendation.title}-${index}`} className="flex flex-col gap-2 rounded-xl border border-border p-3" data-testid="ad-studio-recommendation">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold" dir="auto">
                  {recommendation.title}
                </p>
                <Chip tone={PRIORITY_TONE[recommendation.priority]}>{t(`plan.priority.${recommendation.priority}`)}</Chip>
              </div>
              <p className="text-sm text-muted-foreground" dir="auto">
                {recommendation.rationale}
              </p>
              {recommendation.evidence.length ? (
                <ul className="flex flex-col gap-1">
                  {recommendation.evidence.map((citation, citationIndex) => (
                    <li key={citationIndex} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                      <Chip tone={citation.source === 'market' ? 'primary' : 'ok'}>{sourceLabel(citation.source)}</Chip>
                      <span className="text-muted-foreground" dir="auto">
                        {citation.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {recommendation.unsupported ? <p className="text-xs font-medium text-warning">{t('plan.unsupported')}</p> : null}
            </li>
          ))}
        </ol>
      </ChartCard>

      {plan.marketNotes.length ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-5" aria-labelledby="ad-studio-market-heading" data-testid="ad-studio-market-notes">
          <header className="flex items-start gap-2">
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h3 id="ad-studio-market-heading" className="text-sm font-semibold">
                {t('plan.marketTitle')}
              </h3>
              <p className="text-xs text-muted-foreground">{t('plan.marketDescription')}</p>
            </div>
          </header>
          <ul className="flex list-disc flex-col gap-1 ps-5 text-sm">
            {plan.marketNotes.map((note) => (
              <li key={note}>
                <span dir="auto">{note}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The brief's deep analysis (KAN-230): a button that gathers the evidence and asks the text model
 * for a plan, then what it read (the data-sources checklist with a reason for each missing one), the
 * evidence as charts, and the plan itself - recommendations with the evidence they cite, audience,
 * angles, keyword themes, and market notes kept apart as general model knowledge.
 */
export function PlanningPanel({ orgId, projectId, briefId, plan, sources, generatedBy, aiAvailable }: PlanningPanelProps): React.ReactElement {
  const t = useTranslations('AdStudio');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const dateTime = new Intl.DateTimeFormat(useLocale(), { dateStyle: 'medium', timeStyle: 'short' });

  async function run(): Promise<void> {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}/plan`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as AdStudioApiError;
      if (!response.ok) {
        setMessage({ tone: 'error', text: errorMessage(body) });
        return;
      }
      setMessage({ tone: 'ok', text: t('plan.done') });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: t('errorGeneric') });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="ad-studio-plan-heading" data-testid="ad-studio-planning">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Telescope className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="ad-studio-plan-heading" className="text-base font-semibold">
              {t('plan.title')}
            </h2>
            <p className="max-w-2xl text-xs text-muted-foreground">{t('plan.description')}</p>
            {generatedBy ? (
              <p className="mt-1 text-xs text-muted-foreground">{t('plan.generatedBy', { model: generatedBy.model, date: dateTime.format(new Date(generatedBy.generatedAt)) })}</p>
            ) : null}
            {!aiAvailable ? <p className="mt-1 text-xs text-warning">{t('plan.noProvider')}</p> : null}
            {pending ? (
              <p className="mt-1 text-xs text-muted-foreground" role="status">
                {t('plan.runningHint')}
              </p>
            ) : null}
            {message ? (
              <p role="status" className={cn('mt-1 text-sm', message.tone === 'ok' ? 'text-success' : 'text-destructive')}>
                {message.text}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={!aiAvailable || pending}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Telescope className="h-4 w-4" aria-hidden="true" />}
          {pending ? t('plan.running') : plan ? t('plan.rerun') : t('plan.run')}
        </button>
      </div>

      {plan && sources ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <SourcesChecklist sources={sources} />
            <PlanBody plan={plan} />
          </div>
          <EvidenceCharts sources={sources} />
        </>
      ) : (
        <EmptyState icon={Telescope} title={t('plan.emptyTitle')} description={t('plan.emptyDescription')} compact />
      )}
    </section>
  );
}
