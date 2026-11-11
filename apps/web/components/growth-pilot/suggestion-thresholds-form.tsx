'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import {
  GROWTH_SUGGESTION_THRESHOLD_BOUNDS,
  GROWTH_SUGGESTION_THRESHOLD_KEYS,
  isValidGrowthSuggestionThreshold,
  type GrowthSuggestionThresholdKey,
  type GrowthSuggestionThresholds,
} from '@growthos/shared';
import { cn } from '@/lib/utils';
import { useLocalDateTime } from '@/components/ad-studio/use-local-date-time';

/** Rates are stored as 0-1 and shown as percentages; counts as they are. */
const PERCENT_KEYS: ReadonlySet<GrowthSuggestionThresholdKey> = new Set(['lowCtr', 'raiseBudgetMinCtr', 'raiseBudgetSpendShare']);
const GROUPS: { id: 'groupResults' | 'groupBudget'; keys: GrowthSuggestionThresholdKey[] }[] = [
  { id: 'groupResults', keys: ['noClicksAfterDays', 'noClicksMinImpressions', 'lowCtr', 'lowCtrMinImpressions', 'noConversionsMinClicks'] },
  { id: 'groupBudget', keys: ['raiseBudgetAfterDays', 'raiseBudgetMinCtr', 'raiseBudgetMinConversions', 'raiseBudgetSpendShare'] },
];

/** A stored value as the field shows it (percent for rates, rounded so 0.015 reads 1.5). */
export function toField(key: GrowthSuggestionThresholdKey, value: number): string {
  return String(PERCENT_KEYS.has(key) ? Math.round(value * 100 * 1000) / 1000 : value);
}

/** What the field holds, as the stored value; null when it is empty (use the default); NaN when it is not a number. */
export function fromField(key: GrowthSuggestionThresholdKey, text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return Number.NaN;
  return PERCENT_KEYS.has(key) ? Math.round((value / 100) * 1_000_000) / 1_000_000 : value;
}

export interface SuggestionThresholdsState {
  /** Only the values set at this level; the rest come from the defaults. */
  overrides: Partial<GrowthSuggestionThresholds>;
  /** What applies where nothing is set here. */
  defaults: GrowthSuggestionThresholds;
  lastChangedOn: string | null;
}

/**
 * Edits one layer of the Growth Pilot suggestion thresholds - a project's own values, or the
 * platform defaults - with every value checked against its range before anything is sent. An empty
 * field means "use the default"; "Reset to defaults" clears the layer. The server checks again.
 */
export function SuggestionThresholdsForm({ endpoint, initial, scope }: { endpoint: string; initial: SuggestionThresholdsState; scope: 'project' | 'platform' }): React.ReactElement {
  const t = useTranslations('GrowthPilot.settings');
  const when = useLocalDateTime({ dateStyle: 'medium', timeStyle: 'short' });
  const [state, setState] = React.useState(initial);
  const fieldsOf = (overrides: Partial<GrowthSuggestionThresholds>) => Object.fromEntries(GROWTH_SUGGESTION_THRESHOLD_KEYS.map((key) => [key, overrides[key] === undefined ? '' : toField(key, overrides[key] as number)])) as Record<GrowthSuggestionThresholdKey, string>;
  const [fields, setFields] = React.useState(() => fieldsOf(initial.overrides));
  const [busy, setBusy] = React.useState<'save' | 'reset' | null>(null);
  const [status, setStatus] = React.useState<'saved' | 'reset' | 'invalid' | 'failed' | null>(null);

  const invalid = GROWTH_SUGGESTION_THRESHOLD_KEYS.filter((key) => {
    const value = fromField(key, fields[key]);
    return value !== null && !isValidGrowthSuggestionThreshold(key, value);
  });

  const send = async (method: 'PUT' | 'DELETE', body?: unknown): Promise<void> => {
    setBusy(method === 'PUT' ? 'save' : 'reset');
    setStatus(null);
    try {
      const response = await fetch(endpoint, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const json = (await response.json().catch(() => ({}))) as { settings?: { overrides: Partial<GrowthSuggestionThresholds>; lastChangedOn: string | null }; error?: string };
      if (!response.ok || !json.settings) {
        setStatus(json.error === 'invalid_thresholds' ? 'invalid' : 'failed');
        return;
      }
      const settings = json.settings;
      setState((previous) => ({ ...previous, overrides: settings.overrides, lastChangedOn: settings.lastChangedOn }));
      setFields(fieldsOf(settings.overrides));
      setStatus(method === 'PUT' ? 'saved' : 'reset');
    } catch {
      setStatus('failed');
    } finally {
      setBusy(null);
    }
  };

  const customized = Object.keys(state.overrides).length > 0;
  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid.length) {
          setStatus('invalid');
          return;
        }
        const thresholds = Object.fromEntries(GROWTH_SUGGESTION_THRESHOLD_KEYS.map((key) => [key, fromField(key, fields[key])]).filter(([, value]) => value !== null));
        void send('PUT', { thresholds });
      }}
      data-testid="growth-pilot-thresholds-form"
    >
      <p className="text-sm text-muted-foreground" data-testid="growth-pilot-thresholds-state">
        {customized && state.lastChangedOn
          ? t(scope === 'project' ? 'customized' : 'operatorCustomized', { date: when(state.lastChangedOn) })
          : t(scope === 'project' ? 'usingDefaults' : 'operatorUsingBuiltIn')}
      </p>
      {GROUPS.map((group) => (
        <fieldset key={group.id} className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-soft">
          <legend className="px-1 font-pp-display text-base font-semibold">{t(group.id)}</legend>
          {group.keys.map((key) => {
            const bounds = GROWTH_SUGGESTION_THRESHOLD_BOUNDS[key];
            const bad = invalid.includes(key);
            const id = `growth-pilot-threshold-${key}`;
            return (
              <div key={key} className="flex flex-col gap-1">
                <label htmlFor={id} className="text-sm font-medium">
                  {t(`fields.${key}.label`)}
                </label>
                <input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={PERCENT_KEYS.has(key) ? bounds.min * 100 : bounds.min}
                  max={PERCENT_KEYS.has(key) ? bounds.max * 100 : bounds.max}
                  value={fields[key]}
                  placeholder={toField(key, state.defaults[key])}
                  onChange={(event) => {
                    setFields((previous) => ({ ...previous, [key]: event.target.value }));
                    setStatus(null);
                  }}
                  aria-invalid={bad ? true : undefined}
                  aria-describedby={`${id}-help`}
                  className={cn('h-9 w-40 rounded-xl border bg-background px-2 text-sm tabular-nums', bad ? 'border-destructive' : 'border-input')}
                  data-testid={id}
                />
                <span id={`${id}-help`} className={cn('text-xs', bad ? 'text-destructive' : 'text-muted-foreground')}>
                  {t(`fields.${key}.help`)} {t('defaultValue', { value: toField(key, state.defaults[key]) })} - {t('range', { min: toField(key, bounds.min), max: toField(key, bounds.max) })}
                </span>
              </div>
            );
          })}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy !== null} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60" data-testid="growth-pilot-thresholds-save">
          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          {busy === 'save' ? t('saving') : t('save')}
        </button>
        <button type="button" disabled={busy !== null || !customized} onClick={() => void send('DELETE')} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-5 text-sm font-medium disabled:opacity-60" data-testid="growth-pilot-thresholds-reset">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('reset')}
        </button>
        {status ? (
          <span role={status === 'saved' || status === 'reset' ? 'status' : 'alert'} className={cn('text-sm font-medium', status === 'saved' || status === 'reset' ? 'text-success' : 'text-destructive')} data-testid="growth-pilot-thresholds-status">
            {t(status === 'reset' ? 'resetDone' : status)}
          </span>
        ) : null}
      </div>
    </form>
  );
}
