'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, AlertCircle, Edit2, Check, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';

export interface CampaignDailyBudgetControlProps {
  orgId: string;
  projectId: string;
  targetId: string;
  campaignLabel: string;
  initialDailyBudgetUsd: number;
  disabled?: boolean;
  onBudgetChange?: (newBudget: number) => void;
}

export function CampaignDailyBudgetControl({
  orgId,
  projectId,
  targetId,
  campaignLabel,
  initialDailyBudgetUsd,
  disabled = false,
  onBudgetChange,
}: CampaignDailyBudgetControlProps): React.ReactElement {
  const t = useTranslations('Campaigns');
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [budget, setBudget] = useState(initialDailyBudgetUsd || 50);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(initialDailyBudgetUsd || 50));
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBudget(initialDailyBudgetUsd);
    setInputValue(String(initialDailyBudgetUsd));
  }, [initialDailyBudgetUsd]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  async function executeBudgetUpdate(nextBudget: number): Promise<void> {
    if (disabled || isSyncing || nextBudget <= 0 || nextBudget === budget) {
      setIsEditing(false);
      return;
    }

    const previousBudget = budget;

    // 1. Optimistic update
    setBudget(nextBudget);
    setInputValue(String(nextBudget));
    setIsEditing(false);
    setIsSyncing(true);
    setErrorMessage(null);
    if (onBudgetChange) {
      onBudgetChange(nextBudget);
    }

    try {
      const response = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/automation/actions/quick-execute`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetId,
            actionType: 'budget_change',
            afterDailyBudgetUsd: nextBudget,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        // Rollback state on error
        setBudget(previousBudget);
        setInputValue(String(previousBudget));
        if (onBudgetChange) {
          onBudgetChange(previousBudget);
        }

        if (response.status === 422 && data.violations?.length > 0) {
          setErrorMessage(
            t('guardrailBlockedError', { reason: data.violations[0].message || data.violations[0].type }),
          );
        } else if (response.status === 403) {
          setErrorMessage(t('quickActionPermissionDenied'));
        } else {
          setErrorMessage(data.message || t('pauseError'));
        }
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setBudget(previousBudget);
      setInputValue(String(previousBudget));
      if (onBudgetChange) {
        onBudgetChange(previousBudget);
      }
      setErrorMessage(t('pauseError'));
    } finally {
      setIsSyncing(false);
    }
  }

  function handlePreset(pctChange: number): void {
    const nextVal = Math.max(1, Math.round(budget * (1 + pctChange / 100)));
    executeBudgetUpdate(nextVal);
  }

  function handleCommit(): void {
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed) || parsed <= 0) {
      setInputValue(String(budget));
      setIsEditing(false);
      return;
    }
    executeBudgetUpdate(Math.round(parsed));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      setInputValue(String(budget));
      setIsEditing(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="campaign-daily-budget-control">
      <div className="flex items-center gap-2">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <div className="relative flex items-center">
              <span className="absolute start-2 text-xs font-semibold text-muted-foreground">{'$'}</span>
              <input
                ref={inputRef}
                type="number"
                min="1"
                step="1"
                aria-label={t('dailyBudgetEditLabel', { name: campaignLabel })}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={handleCommit}
                onKeyDown={handleKeyDown}
                className="h-7 w-20 rounded-md border border-input bg-background ps-5 pe-2 text-xs font-bold text-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleCommit();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
              aria-label={t('confirmBudget')}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setInputValue(String(budget));
                setIsEditing(false);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer"
              aria-label={t('cancel')}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled || isSyncing}
              onClick={() => setIsEditing(true)}
              className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-foreground hover:bg-accent/15 transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <span dir="ltr">{`$${budget}`}</span>
              <span>{t('perDay')}</span>
              {!disabled && !isSyncing && (
                <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              )}
            </button>

            {isSyncing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />}
          </div>
        )}

        {/* 1-Click Preset Pills */}
        {!disabled && !isEditing && !isSyncing && (
          <div className="flex items-center gap-1 ms-1">
            <button
              type="button"
              onClick={() => handlePreset(10)}
              className="rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
              title={t('increaseBudgetBy', { percent: 10 })}
            >
              {'+10%'}
            </button>
            <button
              type="button"
              onClick={() => handlePreset(20)}
              className="rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
              title={t('increaseBudgetBy', { percent: 20 })}
            >
              {'+20%'}
            </button>
            <button
              type="button"
              onClick={() => handlePreset(-20)}
              className="rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
              title={t('decreaseBudgetBy', { percent: 20 })}
            >
              {'-20%'}
            </button>
          </div>
        )}
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div role="alert" className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
