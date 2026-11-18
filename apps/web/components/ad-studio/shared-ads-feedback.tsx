'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, MessageSquarePlus, TrendingUp } from 'lucide-react';
import type { AdShareFeedbackItem, AdShareTargetKind, AdShareVerdict } from '@growthos/shared';
import type { SharedCampaignResultsSummary } from '@/lib/ad-studio/share-view';

function formatCurrency(locale: string, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function verdictLabelKey(verdict: AdShareVerdict): 'verdictApproved' | 'verdictChanges' | 'verdictComment' | 'verdictRequest' {
  switch (verdict) {
    case 'approved':
      return 'verdictApproved';
    case 'changes_requested':
      return 'verdictChanges';
    case 'request':
      return 'verdictRequest';
    default:
      return 'verdictComment';
  }
}

interface FeedbackFormProps {
  token: string;
  targetKind: AdShareTargetKind;
  briefId?: string | null;
  campaignId?: string | null;
  campaignLabel?: string | null;
  defaultVerdict?: 'comment' | 'changes_requested' | 'request';
  onSubmitted: (item: AdShareFeedbackItem) => void;
  onClose: () => void;
}

function FeedbackInlineForm({
  token,
  targetKind,
  briefId = null,
  campaignId = null,
  campaignLabel = null,
  defaultVerdict = 'changes_requested',
  onSubmitted,
  onClose,
}: FeedbackFormProps): React.ReactElement {
  const t = useTranslations('AdShare.public');
  const [authorName, setAuthorName] = useState('');
  const [verdict, setVerdict] = useState<'comment' | 'changes_requested' | 'request'>(defaultVerdict);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!comment.trim()) {
      setError(t('commentRequiredError'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/share/ads/${encodeURIComponent(token)}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          authorName: authorName.trim() || undefined,
          targetKind,
          briefId: briefId ?? undefined,
          campaignId: campaignId ?? undefined,
          campaignLabel: campaignLabel ?? undefined,
          verdict,
          comment: comment.trim(),
        }),
      });
      if (!response.ok) {
        setError(t('feedbackSendError'));
        return;
      }
      const data = (await response.json()) as { item: AdShareFeedbackItem };
      onSubmitted(data.item);
      setComment('');
      onClose();
    } catch {
      setError(t('feedbackSendError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-3"
      data-testid="shared-feedback-form"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span>{t('authorLabel')}</span>
          <input
            type="text"
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
            placeholder={t('authorPlaceholder')}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span>{t('verdictLabel')}</span>
          <select
            value={verdict}
            onChange={(event) => setVerdict(event.target.value as 'comment' | 'changes_requested' | 'request')}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
          >
            <option value="changes_requested">{t('verdictChanges')}</option>
            <option value="comment">{t('verdictComment')}</option>
            <option value="request">{t('verdictRequest')}</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium">
        <span>{t('commentLabel')}</span>
        <textarea
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t('commentPlaceholder')}
          className="rounded-lg border border-border bg-background p-2.5 text-sm"
        />
      </label>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? t('sendingFeedback') : t('sendFeedbackButton')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
        >
          {t('cancelFeedbackButton')}
        </button>
      </div>
    </form>
  );
}

async function sendQuickApproval(params: {
  token: string;
  targetKind: AdShareTargetKind;
  briefId?: string;
  campaignId?: string;
  campaignLabel?: string;
}): Promise<AdShareFeedbackItem | null> {
  try {
    const response = await fetch(`/api/share/ads/${encodeURIComponent(params.token)}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetKind: params.targetKind,
        briefId: params.briefId,
        campaignId: params.campaignId,
        campaignLabel: params.campaignLabel,
        verdict: 'approved',
        comment: '',
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { item: AdShareFeedbackItem };
    return data.item;
  } catch {
    return null;
  }
}

function SubmittedFeedbackList({ items }: { items: readonly AdShareFeedbackItem[] }): React.ReactElement | null {
  const t = useTranslations('AdShare.public');
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="shared-submitted-feedback-list">
      <span className="text-xs font-medium text-muted-foreground">{t('clientNotesHeading')}</span>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-baseline gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs"
          >
            <span className="font-semibold text-foreground">{item.authorName || t('defaultClientAuthor')}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                item.verdict === 'approved'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {t(verdictLabelKey(item.verdict))}
            </span>
            {item.comment ? <span className="text-muted-foreground">{item.comment}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SharedResultsSection({
  results,
  allowFeedback,
  token,
  feedback,
  onSubmitted,
}: {
  results: SharedCampaignResultsSummary;
  allowFeedback: boolean;
  token?: string;
  feedback: readonly AdShareFeedbackItem[];
  onSubmitted: (item: AdShareFeedbackItem) => void;
}): React.ReactElement {
  const t = useTranslations('AdShare.public');
  const locale = useLocale();
  const [openCampaignId, setOpenCampaignId] = useState<string | null>(null);
  const [approvingCampaignId, setApprovingCampaignId] = useState<string | null>(null);

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
      data-testid="shared-campaign-results"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold">{t('resultsHeading')}</h2>
          <p className="text-xs text-muted-foreground">{t('resultsIntro')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">{t('totalSpendLabel')}</div>
          <div className="mt-1 text-lg font-bold">{formatCurrency(locale, results.totalSpendUsd)}</div>
        </div>
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">{t('activeCampaignsLabel')}</div>
          <div className="mt-1 text-lg font-bold">
            {results.activeCampaignsCount}/{results.totalCampaignsCount}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">{t('metaSpendLabel')}</div>
          <div className="mt-1 text-lg font-bold">{formatCurrency(locale, results.metaSpendUsd)}</div>
        </div>
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">{t('googleSpendLabel')}</div>
          <div className="mt-1 text-lg font-bold">{formatCurrency(locale, results.googleSpendUsd)}</div>
        </div>
      </div>

      {results.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {results.items.map((item) => {
            const campaignFeedback = feedback.filter((entry) => {
              return entry.campaignId === item.id;
            });
            const alreadyApproved = campaignFeedback.some((entry) => {
              return entry.verdict === 'approved';
            });
            return (
              <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-border/80 bg-background/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.platform === 'meta_ads'
                        ? t('platformMeta')
                        : item.platform === 'google_ads'
                          ? t('platformGoogle')
                          : t('platformSimulated')}{' '}
                      · {item.status === 'enabled' ? t('statusEnabled') : t('statusPaused')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span>
                      {t('spendColumn')}: <strong>{formatCurrency(locale, item.totalSpendUsd)}</strong>
                    </span>
                    <span>
                      {t('roasColumn')}: <strong>{item.roas !== null ? `${item.roas.toFixed(2)}x` : '—'}</strong>
                    </span>
                    <span>
                      {t('ctrColumn')}: <strong>{item.ctrPct !== null ? `${item.ctrPct.toFixed(2)}%` : '—'}</strong>
                    </span>
                    <span>
                      {t('conversionsColumn')}: <strong>{item.conversions ?? '—'}</strong>
                    </span>
                  </div>
                </div>

                {allowFeedback && token ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={approvingCampaignId === item.id}
                      onClick={async () => {
                        setApprovingCampaignId(item.id);
                        const saved = await sendQuickApproval({
                          token,
                          targetKind: 'campaign',
                          campaignId: item.id,
                          campaignLabel: item.label,
                        });
                        setApprovingCampaignId(null);
                        if (saved) onSubmitted(saved);
                      }}
                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {alreadyApproved ? t('approvedDone') : t('approveCampaignButton')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenCampaignId((cur) => (cur === item.id ? null : item.id))}
                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('addNoteButton')}
                    </button>
                  </div>
                ) : null}

                {openCampaignId === item.id && token ? (
                  <FeedbackInlineForm
                    token={token}
                    targetKind="campaign"
                    campaignId={item.id}
                    campaignLabel={item.label}
                    onSubmitted={onSubmitted}
                    onClose={() => setOpenCampaignId(null)}
                  />
                ) : null}

                <SubmittedFeedbackList items={campaignFeedback} />
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function SharedBriefFeedbackBar({
  briefId,
  allowFeedback,
  token,
  feedback,
  onSubmitted,
}: {
  briefId: string;
  allowFeedback: boolean;
  token?: string;
  feedback: readonly AdShareFeedbackItem[];
  onSubmitted: (item: AdShareFeedbackItem) => void;
}): React.ReactElement | null {
  const t = useTranslations('AdShare.public');
  const [formOpen, setFormOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const briefFeedback = feedback.filter((item) => {
    return item.briefId === briefId;
  });
  const isApproved = briefFeedback.some((item) => {
    return item.verdict === 'approved';
  });

  if (!allowFeedback && briefFeedback.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/70 p-4" data-testid={`shared-brief-feedback-${briefId}`}>
      {allowFeedback && token ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={approving}
            data-testid={`shared-brief-approve-${briefId}`}
            onClick={async () => {
              setApproving(true);
              const saved = await sendQuickApproval({ token, targetKind: 'brief', briefId });
              setApproving(false);
              if (saved) onSubmitted(saved);
            }}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {isApproved ? t('approvedDone') : t('approveButton')}
          </button>
          <button
            type="button"
            data-testid={`shared-brief-note-toggle-${briefId}`}
            onClick={() => setFormOpen((open) => !open)}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('addNoteButton')}
          </button>
        </div>
      ) : null}

      {formOpen && token ? (
        <FeedbackInlineForm
          token={token}
          targetKind="brief"
          briefId={briefId}
          onSubmitted={onSubmitted}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <SubmittedFeedbackList items={briefFeedback} />
    </div>
  );
}

export function SharedGeneralRequestSection({
  allowFeedback,
  token,
  feedback,
  onSubmitted,
}: {
  allowFeedback: boolean;
  token?: string;
  feedback: readonly AdShareFeedbackItem[];
  onSubmitted: (item: AdShareFeedbackItem) => void;
}): React.ReactElement | null {
  const t = useTranslations('AdShare.public');
  const [formOpen, setFormOpen] = useState(false);
  const generalFeedback = feedback.filter((item) => {
    return item.targetKind === 'general';
  });

  if (!allowFeedback && generalFeedback.length === 0) {
    return null;
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
      data-testid="shared-general-requests"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t('generalRequestsHeading')}</h2>
        {allowFeedback && token ? (
          <button
            type="button"
            data-testid="shared-general-request-toggle"
            onClick={() => setFormOpen((open) => !open)}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('requestNewAdButton')}
          </button>
        ) : null}
      </div>

      {formOpen && token ? (
        <FeedbackInlineForm
          token={token}
          targetKind="general"
          defaultVerdict="request"
          onSubmitted={onSubmitted}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <SubmittedFeedbackList items={generalFeedback} />
    </section>
  );
}
