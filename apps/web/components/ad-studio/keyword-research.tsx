'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import {
  AD_STUDIO_MATCH_TYPES,
  AD_STUDIO_MAX_KEYWORDS,
  AD_STUDIO_SEARCH_COUNTRIES,
  AD_STUDIO_SEARCH_LANGUAGES,
  cleanKeyword,
  defaultSearchTargeting,
  keywordFromIdea,
  searchKeywordsIssues,
  type AdStudioKeywordIdea,
  type AdStudioMatchType,
  type AdStudioSearchKeyword,
  type AdStudioSearchKeywords,
  type AdStudioSearchTargeting,
} from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface KeywordResearchProps {
  orgId: string;
  projectId: string;
  briefId: string;
  /** The ad language - where the lookup starts. */
  language: string;
  landingPageUrl: string | null;
  /** Saved keywords, or null before any were chosen. */
  initial: AdStudioSearchKeywords | null;
  /** Seed phrases to start from (the plan's keyword themes, the ad name). */
  suggestedSeeds: string[];
}

type Research =
  { status: 'ok'; ideas: AdStudioKeywordIdea[] } | { status: 'unavailable'; reason: string };

const UNAVAILABLE_REASONS = new Set([
  'no_google_ads_credential',
  'credential_not_configured',
  'vault_not_configured',
  'no_seeds',
  'google_ads_auth_failed',
  'developer_token_not_approved',
  'google_ads_error',
]);

function splitList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Keyword research for the ad's search ad: look up Google's monthly searches, competition and
 * top-of-page bids for seed phrases (and the landing page) in a chosen country and language, pick
 * the keywords to bid on with their match types, add your own, and list the searches to exclude.
 */
export function KeywordResearch({
  orgId,
  projectId,
  briefId,
  language,
  landingPageUrl,
  initial,
  suggestedSeeds,
}: KeywordResearchProps): React.ReactElement {
  const t = useTranslations('AdStudio.search');
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}`;
  const [targeting, setTargeting] = React.useState<AdStudioSearchTargeting>(
    initial?.targeting ?? defaultSearchTargeting(language),
  );
  const [seedsText, setSeedsText] = React.useState(suggestedSeeds.join(', '));
  const [useUrl, setUseUrl] = React.useState(Boolean(landingPageUrl));
  const [research, setResearch] = React.useState<Research | null>(null);
  const [selected, setSelected] = React.useState<AdStudioSearchKeyword[]>(initial?.keywords ?? []);
  const [negativesText, setNegativesText] = React.useState((initial?.negatives ?? []).join(', '));
  const [ownKeyword, setOwnKeyword] = React.useState('');
  const [pending, setPending] = React.useState<'research' | 'save' | null>(null);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const number = new Intl.NumberFormat(locale);
  const money = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const value: AdStudioSearchKeywords = {
    targeting,
    keywords: selected,
    negatives: splitList(negativesText),
  };
  const issues = searchKeywordsIssues(value);
  const chosen = new Set(selected.map((keyword) => keyword.text));
  const totalSearches = selected.reduce(
    (sum, keyword) => sum + (keyword.avgMonthlySearches ?? 0),
    0,
  );

  async function runResearch(): Promise<void> {
    setPending('research');
    setMessage(null);
    try {
      const response = await fetch(`${base}/keywords/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seeds: splitList(seedsText),
          url: useUrl ? landingPageUrl : null,
          targeting,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as AdStudioApiError & {
        research?: Research;
      };
      if (!response.ok || !result.research) {
        setMessage({ tone: 'error', text: errorMessage(result) });
        return;
      }
      setResearch(result.research);
    } catch {
      setMessage({ tone: 'error', text: errorMessage({}) });
    } finally {
      setPending(null);
    }
  }

  function add(keyword: AdStudioSearchKeyword): void {
    if (!keyword.text || chosen.has(keyword.text)) return;
    setSelected((current) => [...current, keyword]);
  }

  function addOwn(): void {
    const text = cleanKeyword(ownKeyword);
    if (!text) return;
    const known =
      research?.status === 'ok'
        ? research.ideas.find((idea) => cleanKeyword(idea.keyword) === text)
        : undefined;
    add(
      known
        ? keywordFromIdea(known)
        : {
            text,
            matchType: 'PHRASE',
            avgMonthlySearches: null,
            competition: null,
            lowTopOfPageBid: null,
            highTopOfPageBid: null,
          },
    );
    setOwnKeyword('');
  }

  async function save(): Promise<void> {
    setPending('save');
    setMessage(null);
    try {
      const response = await fetch(`${base}/keywords`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: value }),
      });
      const result = (await response.json().catch(() => ({}))) as AdStudioApiError;
      if (!response.ok) {
        setMessage({ tone: 'error', text: errorMessage(result) });
        return;
      }
      setMessage({ tone: 'ok', text: t('keywordsSaved') });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: errorMessage({}) });
    } finally {
      setPending(null);
    }
  }

  const selectClass = 'h-9 rounded-lg border border-input bg-background px-2 text-sm';
  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="ad-studio-keywords-heading"
      data-testid="ad-studio-keywords"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="ad-studio-keywords-heading"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Search className="h-5 w-5 text-primary" aria-hidden="true" />
          {t('keywordsTitle')}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('keywordsDescription')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('countryLabel')}
          <select
            value={targeting.country}
            onChange={(event) => setTargeting({ ...targeting, country: event.target.value })}
            className={selectClass}
          >
            {Object.keys(AD_STUDIO_SEARCH_COUNTRIES).map((code) => (
              <option key={code} value={code}>
                {t(`countries.${code}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('languageLabel')}
          <select
            value={targeting.language}
            onChange={(event) => setTargeting({ ...targeting, language: event.target.value })}
            className={selectClass}
          >
            {Object.keys(AD_STUDIO_SEARCH_LANGUAGES).map((code) => (
              <option key={code} value={code}>
                {t(`languages.${code}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {t('seedsLabel')}
        <textarea
          value={seedsText}
          onChange={(event) => setSeedsText(event.target.value)}
          rows={2}
          dir="auto"
          placeholder={t('seedsPlaceholder')}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        {landingPageUrl ? (
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={useUrl}
              onChange={(event) => setUseUrl(event.target.checked)}
            />
            {t('useLandingPage')}
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => void runResearch()}
          disabled={pending !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending === 'research' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          {t('research')}
        </button>
      </div>

      {research?.status === 'unavailable' ? (
        <p
          role="status"
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          {t(
            `unavailable.${UNAVAILABLE_REASONS.has(research.reason) ? research.reason : 'google_ads_error'}`,
          )}
        </p>
      ) : null}
      {research?.status === 'ok' ? (
        research.ideas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noIdeas')}</p>
        ) : (
          <div className="max-h-96 overflow-auto rounded-xl border border-border">
            <table className="w-full text-sm" data-testid="ad-studio-keyword-ideas">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{t('columns.keyword')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('columns.searches')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('columns.competition')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('columns.bid')}</th>
                  <th className="px-3 py-2" aria-label={t('columns.add')} />
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {research.ideas.map((idea) => {
                  const text = cleanKeyword(idea.keyword);
                  return (
                    <tr key={idea.keyword} className="border-t border-border">
                      <td className="px-3 py-1.5" dir="auto">
                        {idea.keyword}
                      </td>
                      <td className="px-3 py-1.5 text-end">
                        {idea.avgMonthlySearches === null
                          ? '-'
                          : number.format(idea.avgMonthlySearches)}
                      </td>
                      <td className="px-3 py-1.5">
                        {idea.competition ? t(`competition.${idea.competition}`) : '-'}
                      </td>
                      <td className="px-3 py-1.5 text-end">
                        {idea.lowTopOfPageBid === null && idea.highTopOfPageBid === null
                          ? '-'
                          : `${money.format(idea.lowTopOfPageBid ?? 0)}-${money.format(idea.highTopOfPageBid ?? 0)}`}
                      </td>
                      <td className="px-3 py-1.5 text-end">
                        <button
                          type="button"
                          onClick={() => add(keywordFromIdea(idea))}
                          disabled={chosen.has(text) || selected.length >= AD_STUDIO_MAX_KEYWORDS}
                          aria-label={t('addKeyword', { keyword: idea.keyword })}
                          className="rounded-md p-1 text-primary hover:bg-primary/10 disabled:text-muted-foreground disabled:opacity-50"
                        >
                          {chosen.has(text) ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}
      {research?.status === 'ok' ? (
        <p className="-mt-2 text-xs text-muted-foreground">{t('bidNote')}</p>
      ) : null}

      <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">
            {t('selectedTitle', { count: selected.length })}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('selectedSearches', { searches: number.format(totalSearches) })}
          </span>
        </div>
        {selected.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('selectedEmpty')}</p>
        ) : null}
        <ul className="flex flex-col gap-1.5" data-testid="ad-studio-selected-keywords">
          {selected.map((keyword, position) => (
            <li key={keyword.text} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {keyword.text}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {keyword.avgMonthlySearches === null
                  ? ''
                  : number.format(keyword.avgMonthlySearches)}
              </span>
              <select
                aria-label={t('matchTypeLabel', { keyword: keyword.text })}
                value={keyword.matchType}
                onChange={(event) =>
                  setSelected((current) =>
                    current.map((entry, index) =>
                      index === position
                        ? { ...entry, matchType: event.target.value as AdStudioMatchType }
                        : entry,
                    ),
                  )
                }
                className="h-8 rounded-md border border-input bg-background px-1 text-xs"
              >
                {AD_STUDIO_MATCH_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`matchTypes.${type}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setSelected((current) => current.filter((_, index) => index !== position))
                }
                aria-label={t('removeKeyword', { keyword: keyword.text })}
                className="rounded p-1 hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input
            value={ownKeyword}
            onChange={(event) => setOwnKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addOwn();
              }
            }}
            placeholder={t('ownKeywordPlaceholder')}
            aria-label={t('ownKeywordPlaceholder')}
            dir="auto"
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
          />
          <button
            type="button"
            onClick={addOwn}
            disabled={!cleanKeyword(ownKeyword) || selected.length >= AD_STUDIO_MAX_KEYWORDS}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('addOwn')}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t('matchTypesHint')}</p>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {t('negativesLabel')}
        <textarea
          value={negativesText}
          onChange={(event) => setNegativesText(event.target.value)}
          rows={2}
          dir="auto"
          placeholder={t('negativesPlaceholder')}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        <span className="font-normal">{t('negativesHint')}</span>
      </label>

      {issues.length ? (
        <ul className="text-xs text-destructive">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              {t(`issues.${issue.code}`, { index: issue.index ?? 0 })}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
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
          {t('saveKeywords')}
        </button>
        {selected.length ? (
          <button
            type="button"
            onClick={() => setSelected([])}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t('clearKeywords')}
          </button>
        ) : null}
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
