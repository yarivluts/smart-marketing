'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart3, Check, Loader2, Plus, Search, Users, X } from 'lucide-react';
import {
  AD_STUDIO_MAX_CUSTOM_AUDIENCES,
  AD_STUDIO_MAX_INTERESTS,
  AD_STUDIO_META_AGE,
  defaultMetaTargeting,
  metaTargetingIssues,
  normalizeMetaTargeting,
  type AdStudioAudienceRef,
  type AdStudioGender,
  type AdStudioMetaTargeting,
} from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface AudiencePanelProps {
  orgId: string;
  projectId: string;
  briefId: string;
  language: string;
  /** Saved targeting, or null before any was chosen. */
  initial: AdStudioMetaTargeting | null;
}

type Unavailable = { status: 'unavailable'; reason: string };
type Result<T> = { status: 'ok'; data: T } | Unavailable;
interface Audience extends AdStudioAudienceRef {
  kind: 'custom' | 'lookalike' | 'saved';
}
interface PerformanceRow {
  segment: string[];
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversions: number;
}
type Breakdown = 'age_gender' | 'placement' | 'country';

const REASONS = new Set([
  'no_meta_credential',
  'credential_not_configured',
  'vault_not_configured',
  'meta_auth_failed',
  'meta_permission_denied',
  'meta_rate_limited',
  'meta_error',
]);
const AGES = Array.from(
  { length: AD_STUDIO_META_AGE.max - AD_STUDIO_META_AGE.min + 1 },
  (_, index) => AD_STUDIO_META_AGE.min + index,
);

/**
 * Who the ad is for on Facebook and Instagram, planned from the project's real Meta ad account:
 * countries, ages and genders, the account's own custom and lookalike audiences and interests -
 * each with Meta's audience size - a reach estimate, and what the account's past ads achieved by
 * age and gender, placement and country. Publishing to Meta targets what is saved here.
 */
export function AudiencePanel({
  orgId,
  projectId,
  briefId,
  language,
  initial,
}: AudiencePanelProps): React.ReactElement {
  const t = useTranslations('AdStudio.audience');
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}`;
  const [targeting, setTargeting] = React.useState<AdStudioMetaTargeting>(
    initial ?? defaultMetaTargeting(language),
  );
  const [countriesText, setCountriesText] = React.useState(targeting.countries.join(', '));
  const [audiences, setAudiences] = React.useState<Result<Audience[]> | null>(null);
  const [interestQuery, setInterestQuery] = React.useState('');
  const [interestResults, setInterestResults] = React.useState<Result<
    AdStudioAudienceRef[]
  > | null>(null);
  const [estimate, setEstimate] = React.useState<Result<{
    monthlyLower: number | null;
    monthlyUpper: number | null;
    ready: boolean;
  }> | null>(null);
  const [breakdown, setBreakdown] = React.useState<Breakdown | null>(null);
  const [performance, setPerformance] = React.useState<
    Partial<Record<Breakdown, Result<PerformanceRow[]>>>
  >({});
  const [pending, setPending] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const current = normalizeMetaTargeting({
    ...targeting,
    countries: countriesText.split(/[\s,]+/).filter(Boolean),
  });
  const issues = metaTargetingIssues(current);
  const size = (lower: number | null, upper: number | null) =>
    lower === null && upper === null
      ? t('sizeUnknown')
      : lower === upper || lower === null || upper === null
        ? compact.format((lower ?? upper) as number)
        : `${compact.format(lower)}-${compact.format(upper)}`;

  async function call<T>(key: string, url: string, init?: RequestInit): Promise<T | null> {
    setPending(key);
    setMessage(null);
    try {
      const response = await fetch(url, init);
      const body = (await response.json().catch(() => ({}))) as AdStudioApiError & T;
      if (!response.ok) {
        setMessage({ tone: 'error', text: errorMessage(body) });
        return null;
      }
      return body;
    } catch {
      setMessage({ tone: 'error', text: errorMessage({}) });
      return null;
    } finally {
      setPending(null);
    }
  }

  // The account's own audiences, once: a single read of the connected Meta account.
  React.useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch(`${base}/audiences`, { cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as { result?: Result<Audience[]> };
        if (live && body.result) setAudiences(body.result);
      } catch {
        // The panel still works without them.
      }
    })();
    return () => {
      live = false;
    };
  }, [base]);

  function toggleAudience(audience: Audience): void {
    setTargeting((value) => {
      const chosen = value.customAudiences.some((entry) => entry.id === audience.id);
      const ref = {
        id: audience.id,
        name: audience.name,
        sizeLower: audience.sizeLower,
        sizeUpper: audience.sizeUpper,
      };
      return {
        ...value,
        customAudiences: chosen
          ? value.customAudiences.filter((entry) => entry.id !== audience.id)
          : [...value.customAudiences, ref],
      };
    });
    setEstimate(null);
  }

  function addInterest(interest: AdStudioAudienceRef): void {
    setTargeting((value) =>
      value.interests.some((entry) => entry.id === interest.id)
        ? value
        : { ...value, interests: [...value.interests, interest] },
    );
    setEstimate(null);
  }

  async function searchInterests(): Promise<void> {
    const body = await call<{ result: Result<AdStudioAudienceRef[]> }>(
      'interests',
      `${base}/audiences/interests?q=${encodeURIComponent(interestQuery)}`,
    );
    if (body) setInterestResults(body.result);
  }

  async function runEstimate(): Promise<void> {
    const body = await call<{
      result: Result<{ monthlyLower: number | null; monthlyUpper: number | null; ready: boolean }>;
    }>('estimate', `${base}/audiences/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targeting: current }),
    });
    if (body) setEstimate(body.result);
  }

  async function showPerformance(next: Breakdown): Promise<void> {
    setBreakdown(next);
    if (performance[next]) return;
    const body = await call<{ result: Result<PerformanceRow[]> }>(
      `performance-${next}`,
      `${base}/audiences/performance?breakdown=${next}`,
    );
    if (body) setPerformance((rows) => ({ ...rows, [next]: body.result }));
  }

  async function save(): Promise<void> {
    const body = await call<{ brief: unknown }>('save', `${base}/targeting`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targeting: current }),
    });
    if (body) {
      setMessage({ tone: 'ok', text: t('saved') });
      router.refresh();
    }
  }

  const reason = (result: Unavailable) =>
    t(`unavailable.${REASONS.has(result.reason) ? result.reason : 'meta_error'}`);
  const genderChoice: 'all' | AdStudioGender =
    targeting.genders.length === 1 ? targeting.genders[0] : 'all';
  const rows = breakdown ? performance[breakdown] : undefined;
  const select = 'h-9 rounded-lg border border-input bg-background px-2 text-sm';

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="ad-studio-audience-heading"
      data-testid="ad-studio-audience"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="ad-studio-audience-heading"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          {t('title')}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('countriesLabel')}
          <input
            value={countriesText}
            onChange={(event) => {
              setCountriesText(event.target.value);
              setEstimate(null);
            }}
            dir="ltr"
            className="h-9 w-40 rounded-lg border border-input bg-background px-3 text-sm uppercase text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('ageMin')}
          <select
            value={targeting.ageMin}
            onChange={(event) => setTargeting({ ...targeting, ageMin: Number(event.target.value) })}
            className={select}
          >
            {AGES.map((age) => (
              <option key={age} value={age}>
                {age}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('ageMax')}
          <select
            value={targeting.ageMax}
            onChange={(event) => setTargeting({ ...targeting, ageMax: Number(event.target.value) })}
            className={select}
          >
            {AGES.map((age) => (
              <option key={age} value={age}>
                {age === AD_STUDIO_META_AGE.max ? `${age}+` : age}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('gendersLabel')}>
          {(['all', 'female', 'male'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={genderChoice === option}
              onClick={() =>
                setTargeting({ ...targeting, genders: option === 'all' ? [] : [option] })
              }
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                genderChoice === option
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {t(`genders.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <span className="text-sm font-semibold">
          {t('audiencesTitle', {
            count: targeting.customAudiences.length,
            max: AD_STUDIO_MAX_CUSTOM_AUDIENCES,
          })}
        </span>
        {audiences === null ? (
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t('loading')}
          </span>
        ) : audiences.status === 'unavailable' ? (
          <p role="status" className="text-xs text-warning">
            {reason(audiences)}
          </p>
        ) : audiences.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noAudiences')}</p>
        ) : (
          <ul
            className="flex max-h-60 flex-col gap-1 overflow-auto"
            data-testid="ad-studio-meta-audiences"
          >
            {audiences.data.map((audience) => {
              const chosen = targeting.customAudiences.some((entry) => entry.id === audience.id);
              const usable = audience.kind !== 'saved';
              return (
                <li key={audience.id}>
                  <label className={cn('flex items-center gap-2 text-sm', !usable && 'opacity-60')}>
                    <input
                      type="checkbox"
                      checked={chosen}
                      disabled={
                        !usable ||
                        (!chosen &&
                          targeting.customAudiences.length >= AD_STUDIO_MAX_CUSTOM_AUDIENCES)
                      }
                      onChange={() => toggleAudience(audience)}
                    />
                    <span className="min-w-0 flex-1 truncate" dir="auto">
                      {audience.name}
                    </span>
                    <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">
                      {t(`kinds.${audience.kind}`)}
                    </span>
                    <span className="w-24 text-end text-xs tabular-nums text-muted-foreground">
                      {size(audience.sizeLower, audience.sizeUpper)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {audiences?.status === 'ok' &&
        audiences.data.some((audience) => audience.kind === 'saved') ? (
          <p className="text-xs text-muted-foreground">{t('savedNote')}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <span className="text-sm font-semibold">
          {t('interestsTitle', { count: targeting.interests.length, max: AD_STUDIO_MAX_INTERESTS })}
        </span>
        <div className="flex flex-wrap gap-2">
          <input
            value={interestQuery}
            onChange={(event) => setInterestQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void searchInterests();
              }
            }}
            placeholder={t('interestPlaceholder')}
            aria-label={t('interestPlaceholder')}
            dir="auto"
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void searchInterests()}
            disabled={!interestQuery.trim() || pending !== null}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
          >
            {pending === 'interests' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            {t('searchInterests')}
          </button>
        </div>
        {interestResults?.status === 'unavailable' ? (
          <p role="status" className="text-xs text-warning">
            {reason(interestResults)}
          </p>
        ) : null}
        {interestResults?.status === 'ok' ? (
          interestResults.data.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noInterests')}</p>
          ) : (
            <ul
              className="flex max-h-48 flex-col gap-1 overflow-auto"
              data-testid="ad-studio-interest-results"
            >
              {interestResults.data.map((interest) => {
                const chosen = targeting.interests.some((entry) => entry.id === interest.id);
                return (
                  <li key={interest.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate" dir="auto">
                      {interest.name}
                    </span>
                    <span className="w-24 text-end text-xs tabular-nums text-muted-foreground">
                      {size(interest.sizeLower, interest.sizeUpper)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        addInterest({
                          id: interest.id,
                          name: interest.name,
                          sizeLower: interest.sizeLower,
                          sizeUpper: interest.sizeUpper,
                        })
                      }
                      disabled={chosen || targeting.interests.length >= AD_STUDIO_MAX_INTERESTS}
                      aria-label={t('addInterest', { name: interest.name })}
                      className="rounded p-1 text-primary hover:bg-primary/10 disabled:text-muted-foreground"
                    >
                      {chosen ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
        {targeting.interests.length ? (
          <div className="flex flex-wrap gap-1.5" data-testid="ad-studio-chosen-interests">
            {targeting.interests.map((interest) => (
              <span
                key={interest.id}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pe-1 ps-2.5 text-xs text-primary"
              >
                <span dir="auto">{interest.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setTargeting({
                      ...targeting,
                      interests: targeting.interests.filter((entry) => entry.id !== interest.id),
                    });
                    setEstimate(null);
                  }}
                  aria-label={t('removeInterest', { name: interest.name })}
                  className="rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">{t('interestsHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void runEstimate()}
          disabled={pending !== null || issues.length > 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {pending === 'estimate' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Users className="h-4 w-4" aria-hidden="true" />
          )}
          {t('estimate')}
        </button>
        {estimate?.status === 'ok' ? (
          <span className="text-sm font-semibold" data-testid="ad-studio-reach-estimate">
            {estimate.data.monthlyLower === null && estimate.data.monthlyUpper === null
              ? t('estimateNone')
              : t('estimateValue', {
                  range: size(estimate.data.monthlyLower, estimate.data.monthlyUpper),
                })}
          </span>
        ) : estimate?.status === 'unavailable' ? (
          <span role="status" className="text-xs text-warning">
            {reason(estimate)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
          {t('pastTitle')}
        </span>
        <p className="text-xs text-muted-foreground">{t('pastDescription')}</p>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('pastTitle')}>
          {(['age_gender', 'placement', 'country'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={breakdown === option}
              onClick={() => void showPerformance(option)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                breakdown === option
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {pending === `performance-${option}` ? (
                <Loader2 className="me-1 inline h-3 w-3 animate-spin" aria-hidden="true" />
              ) : null}
              {t(`breakdowns.${option}`)}
            </button>
          ))}
        </div>
        {rows?.status === 'unavailable' ? (
          <p role="status" className="text-xs text-warning">
            {reason(rows)}
          </p>
        ) : null}
        {rows?.status === 'ok' ? (
          rows.data.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('pastEmpty')}</p>
          ) : (
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs" data-testid="ad-studio-meta-performance">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-start font-medium">{t('columns.segment')}</th>
                    <th className="px-2 py-1.5 text-end font-medium">{t('columns.spend')}</th>
                    <th className="px-2 py-1.5 text-end font-medium">{t('columns.linkClicks')}</th>
                    <th className="px-2 py-1.5 text-end font-medium">{t('columns.ctr')}</th>
                    <th className="px-2 py-1.5 text-end font-medium">
                      {t('columns.costPerClick')}
                    </th>
                    <th className="px-2 py-1.5 text-end font-medium">{t('columns.conversions')}</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.data.slice(0, 30).map((row) => (
                    <tr key={row.segment.join('|')} className="border-t border-border">
                      <td className="px-2 py-1">
                        {row.segment
                          .map((part) => (t.has(`segments.${part}`) ? t(`segments.${part}`) : part))
                          .join(' · ')}
                      </td>
                      <td className="px-2 py-1 text-end">{number.format(row.spend)}</td>
                      <td className="px-2 py-1 text-end">{number.format(row.linkClicks)}</td>
                      <td className="px-2 py-1 text-end">
                        {row.impressions
                          ? `${number.format((row.clicks / row.impressions) * 100)}%`
                          : '-'}
                      </td>
                      <td className="px-2 py-1 text-end">
                        {row.linkClicks ? number.format(row.spend / row.linkClicks) : '-'}
                      </td>
                      <td className="px-2 py-1 text-end">{number.format(row.conversions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
        {rows?.status === 'ok' ? (
          <p className="text-xs text-muted-foreground">{t('currencyNote')}</p>
        ) : null}
      </div>

      {issues.length ? (
        <ul className="text-xs text-destructive">
          {issues.map((issue) => (
            <li key={issue}>{t(`issues.${issue}`)}</li>
          ))}
        </ul>
      ) : null}
      <div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending !== null || issues.length > 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending === 'save' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          {t('save')}
        </button>
      </div>
      {message ? (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={cn('text-sm', message.tone === 'error' ? 'text-destructive' : 'text-success')}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
