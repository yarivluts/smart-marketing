'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Plus, Shuffle, Sparkles, X } from 'lucide-react';
import {
  AD_STUDIO_RSA_DESCRIPTION_MAX,
  AD_STUDIO_RSA_DESCRIPTIONS,
  AD_STUDIO_RSA_HEADLINE_MAX,
  AD_STUDIO_RSA_HEADLINES,
  AD_STUDIO_RSA_PATH_MAX,
  searchAdDisplayUrl,
  searchAdIssues,
  type AdStudioSearchAd,
} from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface SearchAdEditorProps {
  orgId: string;
  projectId: string;
  briefId: string;
  initial: AdStudioSearchAd | null;
  /** How many keywords the ad bids on - the AI writes for them. */
  keywordCount: number;
  linkUrl: string | null;
  advertiser: string;
  /** A text model is configured, so the AI can write the ad. */
  aiAvailable: boolean;
}

function padded(lines: readonly string[], min: number): string[] {
  return [...lines, ...Array.from({ length: Math.max(0, min - lines.length) }, () => '')];
}

/** One line of text with its character count against Google's limit. */
function LimitedInput({
  value,
  max,
  label,
  onChange,
  onRemove,
  removeLabel,
}: {
  value: string;
  max: number;
  label: string;
  onChange: (value: string) => void;
  onRemove?: () => void;
  removeLabel: string;
}): React.ReactElement {
  const length = value.trim().length;
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        dir="auto"
        className={cn(
          'h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm',
          length > max ? 'border-destructive' : 'border-input',
        )}
      />
      <span
        className={cn(
          'w-12 text-end text-xs tabular-nums',
          length > max ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {length}/{max}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="rounded p-1 hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : (
        <span className="w-[22px]" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * The ad's responsive search ad: up to 15 headlines and 4 descriptions that Google mixes and
 * matches, the display-URL paths, written by the AI from the plan and the keywords or by hand,
 * with Google's limits counted as you type and a preview of how it shows on a results page.
 */
export function SearchAdEditor({
  orgId,
  projectId,
  briefId,
  initial,
  keywordCount,
  linkUrl,
  advertiser,
  aiAvailable,
}: SearchAdEditorProps): React.ReactElement {
  const t = useTranslations('AdStudio.search');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}/search-ad`;
  const fromAd = (ad: AdStudioSearchAd | null) => ({
    headlines: padded(ad?.headlines ?? [], AD_STUDIO_RSA_HEADLINES.min),
    descriptions: padded(ad?.descriptions ?? [], AD_STUDIO_RSA_DESCRIPTIONS.min),
    path1: ad?.path1 ?? '',
    path2: ad?.path2 ?? '',
  });
  const [draft, setDraft] = React.useState<AdStudioSearchAd>(() => fromAd(initial));
  const [saved, setSaved] = React.useState(initial);
  const [pending, setPending] = React.useState<'write' | 'save' | null>(null);
  const [confirmRewrite, setConfirmRewrite] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [combination, setCombination] = React.useState(0);

  const issues = searchAdIssues(draft);
  const headlines = draft.headlines.map((line) => line.trim()).filter(Boolean);
  const descriptions = draft.descriptions.map((line) => line.trim()).filter(Boolean);
  // A preview shows three headlines and two descriptions; "another combination" rotates them as Google would.
  const pick = (lines: string[], count: number) =>
    lines.length
      ? Array.from(
          { length: Math.min(count, lines.length) },
          (_, index) => lines[(index + combination) % lines.length],
        )
      : [];

  const setLine = (field: 'headlines' | 'descriptions', position: number, value: string) =>
    setDraft((current) => ({
      ...current,
      [field]: current[field].map((line, index) => (index === position ? value : line)),
    }));
  const removeLine = (field: 'headlines' | 'descriptions', position: number) =>
    setDraft((current) => ({
      ...current,
      [field]: current[field].filter((_, index) => index !== position),
    }));

  async function request(method: 'POST' | 'PUT'): Promise<void> {
    setPending(method === 'POST' ? 'write' : 'save');
    setMessage(null);
    setConfirmRewrite(false);
    try {
      const response = await fetch(method === 'POST' ? `${base}/generate` : base, {
        method,
        ...(method === 'PUT'
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ad: draft }) }
          : {}),
      });
      const result = (await response.json().catch(() => ({}))) as AdStudioApiError & {
        brief?: { searchAd?: AdStudioSearchAd | null };
      };
      if (!response.ok) {
        setMessage({ tone: 'error', text: errorMessage(result) });
        return;
      }
      const ad = result.brief?.searchAd ?? null;
      setSaved(ad);
      setDraft(fromAd(ad));
      setMessage({ tone: 'ok', text: method === 'POST' ? t('adWritten') : t('adSaved') });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: errorMessage({}) });
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="ad-studio-search-ad-heading"
      data-testid="ad-studio-search-ad"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="ad-studio-search-ad-heading" className="text-lg font-semibold">
            {t('adTitle')}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{t('adDescription')}</p>
          {keywordCount === 0 ? <p className="text-xs text-warning">{t('noKeywordsYet')}</p> : null}
        </div>
        {confirmRewrite ? (
          <div className="flex items-center gap-2 text-sm">
            <span>{t('confirmRewrite')}</span>
            <button
              type="button"
              onClick={() => void request('POST')}
              className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground"
            >
              {t('confirmRewriteYes')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmRewrite(false)}
              className="rounded-lg px-3 py-1.5 hover:bg-muted"
            >
              {t('cancel')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => (saved ? setConfirmRewrite(true) : void request('POST'))}
            disabled={!aiAvailable || pending !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {pending === 'write' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {saved ? t('rewriteAd') : t('writeAd')}
          </button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium">
              {t('headlinesLabel', { count: headlines.length, max: AD_STUDIO_RSA_HEADLINES.max })}
            </legend>
            {draft.headlines.map((line, index) => (
              <LimitedInput
                key={`h-${index}`}
                value={line}
                max={AD_STUDIO_RSA_HEADLINE_MAX}
                label={t('headlineLabel', { index: index + 1 })}
                onChange={(value) => setLine('headlines', index, value)}
                onRemove={
                  draft.headlines.length > AD_STUDIO_RSA_HEADLINES.min
                    ? () => removeLine('headlines', index)
                    : undefined
                }
                removeLabel={t('removeLine')}
              />
            ))}
            {draft.headlines.length < AD_STUDIO_RSA_HEADLINES.max ? (
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({ ...current, headlines: [...current.headlines, ''] }))
                }
                className="inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t('addHeadline')}
              </button>
            ) : null}
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium">
              {t('descriptionsLabel', {
                count: descriptions.length,
                max: AD_STUDIO_RSA_DESCRIPTIONS.max,
              })}
            </legend>
            {draft.descriptions.map((line, index) => (
              <LimitedInput
                key={`d-${index}`}
                value={line}
                max={AD_STUDIO_RSA_DESCRIPTION_MAX}
                label={t('descriptionLineLabel', { index: index + 1 })}
                onChange={(value) => setLine('descriptions', index, value)}
                onRemove={
                  draft.descriptions.length > AD_STUDIO_RSA_DESCRIPTIONS.min
                    ? () => removeLine('descriptions', index)
                    : undefined
                }
                removeLabel={t('removeLine')}
              />
            ))}
            {draft.descriptions.length < AD_STUDIO_RSA_DESCRIPTIONS.max ? (
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    descriptions: [...current.descriptions, ''],
                  }))
                }
                className="inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t('addDescription')}
              </button>
            ) : null}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            {(['path1', 'path2'] as const).map((field) => (
              <label
                key={field}
                className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
              >
                {t(`${field}Label`)}
                <input
                  value={draft[field]}
                  maxLength={AD_STUDIO_RSA_PATH_MAX}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [field]: event.target.value }))
                  }
                  dir="auto"
                  className="h-9 w-40 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t('previewTitle')}</span>
          <div
            className="rounded-xl border border-border bg-background p-4 shadow-sm"
            data-testid="ad-studio-search-preview"
          >
            <div className="flex items-center gap-2 text-xs">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold"
                aria-hidden="true"
              >
                {advertiser.trim().charAt(0).toUpperCase() || 'A'}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium" dir="auto">
                  {advertiser}
                </span>
                <span className="truncate text-muted-foreground" dir="ltr">
                  {searchAdDisplayUrl(linkUrl, draft)}
                </span>
              </div>
            </div>
            <p className="mt-1 text-[11px] font-semibold">{t('sponsored')}</p>
            <p className="mt-1 text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]" dir="auto">
              {pick(headlines, 3).join(' | ') || t('previewHeadlinePlaceholder')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground" dir="auto">
              {pick(descriptions, 2).join(' ') || t('previewDescriptionPlaceholder')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCombination((current) => current + 1)}
            disabled={headlines.length < 2}
            className="inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
            {t('anotherCombination')}
          </button>
          <p className="text-xs text-muted-foreground">{t('previewNote')}</p>
        </div>
      </div>

      {issues.length ? (
        <ul className="text-xs text-destructive">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              {t(`issues.${issue.code}`, { index: issue.index ?? 0 })}
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <button
          type="button"
          onClick={() => void request('PUT')}
          disabled={pending !== null || issues.length > 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending === 'save' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          {t('saveAd')}
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
