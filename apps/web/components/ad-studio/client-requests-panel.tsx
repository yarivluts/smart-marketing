'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Check,
  Copy,
  Download,
  MessageSquarePlus,
  Send,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import {
  buildClientFeedbackFixPrompt,
  buildClientFeedbackReport,
  type AdShareFeedbackItem,
  type AdShareFeedbackStatus,
  type AdShareProposalView,
  type AdShareVerdict,
  type ClientFixPromptBriefSnapshot,
} from '@growthos/shared';
import { formatShareDate } from '@/lib/ad-studio/share-view';
import { shareUrl, type ShareLinkRow } from './share-links-panel';

export interface ClientRequestsPanelProps {
  orgId: string;
  projectId: string;
  projectName: string;
  briefs: { id: string; name: string }[];
  initialFeedback: AdShareFeedbackItem[];
  initialProposals: AdShareProposalView[];
  shareLinks: ShareLinkRow[];
  canCreateShareLink: boolean;
  aiAvailable: boolean;
}

function feedbackStatusKey(
  status: AdShareFeedbackStatus,
): 'statusOpen' | 'statusProposed' | 'statusApplied' | 'statusDeclined' | 'statusSentToClient' {
  switch (status) {
    case 'proposed':
      return 'statusProposed';
    case 'applied':
      return 'statusApplied';
    case 'declined':
      return 'statusDeclined';
    case 'sent_to_client':
      return 'statusSentToClient';
    default:
      return 'statusOpen';
  }
}

function feedbackVerdictKey(
  verdict: AdShareVerdict,
): 'verdictApproved' | 'verdictChanges' | 'verdictComment' | 'verdictRequest' {
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

export function ClientRequestsPanel({
  orgId,
  projectId,
  projectName,
  briefs,
  initialFeedback,
  initialProposals,
  shareLinks: initialShareLinks,
  canCreateShareLink,
  aiAvailable,
}: ClientRequestsPanelProps): React.ReactElement {
  const t = useTranslations('AdShare.requests');
  const locale = useLocale();
  const router = useRouter();
  const uiLocale: 'en' | 'he' = locale === 'he' ? 'he' : 'en';

  const [feedback, setFeedback] = useState<AdShareFeedbackItem[]>(initialFeedback);
  const [proposals, setProposals] = useState<AdShareProposalView[]>(initialProposals);
  const [shareLinks, setShareLinks] = useState<ShareLinkRow[]>(initialShareLinks);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualClientLabel, setManualClientLabel] = useState('');
  const [manualScope, setManualScope] = useState('__general__');
  const [manualComment, setManualComment] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedFlag, setCopiedFlag] = useState<'report' | 'fix' | 'link' | null>(null);

  const [revisionNote, setRevisionNote] = useState('');
  const [sendingRevision, setSendingRevision] = useState(false);
  const [updatedShareUrl, setUpdatedShareUrl] = useState<string | null>(null);

  const openActionableCount = useMemo(
    () => feedback.filter((item) => item.status === 'open' && item.verdict !== 'approved').length,
    [feedback],
  );
  const hasAppliedUpdates = useMemo(
    () =>
      proposals.some((proposal) => proposal.status === 'applied') ||
      feedback.some((item) => item.status === 'applied'),
    [proposals, feedback],
  );
  const nextRevision = useMemo(
    () => Math.max(1, ...shareLinks.map((link) => link.revisionNumber ?? 1)) + 1,
    [shareLinks],
  );

  const generatedAt = useMemo(() => initialFeedback[0]?.createdOn ?? new Date().toISOString(), [initialFeedback]);
  const briefSnapshots = useMemo<ClientFixPromptBriefSnapshot[]>(
    () =>
      briefs.map((b) => ({
        id: b.id,
        name: b.name,
        objective: '',
        productDescription: '',
        landingPageUrl: null,
        language: uiLocale,
        videoInstructions: null,
        videoCopy: null,
        scenes: [],
        imageConcepts: [],
        searchAd: null,
      })),
    [briefs, uiLocale],
  );
  const reportMarkdown = useMemo(
    () =>
      buildClientFeedbackReport({
        projectName,
        brandName: projectName,
        generatedAt,
        locale: uiLocale,
        items: feedback,
      }),
    [projectName, generatedAt, uiLocale, feedback],
  );
  const fixAgentPrompt = useMemo(
    () =>
      buildClientFeedbackFixPrompt({
        projectName,
        brandName: projectName,
        items: feedback,
        briefs: briefSnapshots,
      }),
    [projectName, feedback, briefSnapshots],
  );

  async function copyText(kind: 'report' | 'fix' | 'link', text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFlag(kind);
      setTimeout(() => setCopiedFlag((cur) => (cur === kind ? null : cur)), 2000);
    } catch {
      // Clipboard may be restricted in non-HTTPS contexts.
    }
  }

  function downloadMarkdown(): void {
    const blob = new Blob([reportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `client-feedback-${projectId}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function reloadState(): Promise<void> {
    const response = await fetch(
      `/api/orgs/${orgId}/projects/${projectId}/ad-studio/client-requests?locale=${uiLocale}`,
      { cache: 'no-store' },
    );
    if (!response.ok) return;
    const data = (await response.json()) as {
      feedback?: AdShareFeedbackItem[];
      proposals?: AdShareProposalView[];
    };
    if (Array.isArray(data.feedback)) setFeedback(data.feedback);
    if (Array.isArray(data.proposals)) setProposals(data.proposals);
  }

  async function handleSaveManualRequest(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!manualComment.trim()) return;
    setSavingManual(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ad-studio/client-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'add_request',
          clientLabel: manualClientLabel.trim(),
          authorName: manualClientLabel.trim() || undefined,
          targetKind: manualScope === '__general__' ? 'general' : 'brief',
          briefId: manualScope === '__general__' ? null : manualScope,
          verdict: 'request',
          comment: manualComment.trim(),
        }),
      });
      if (!response.ok) throw new Error('manual_failed');
      const data = (await response.json()) as { item: AdShareFeedbackItem };
      setFeedback((prev) => [data.item, ...prev]);
      setManualComment('');
      setManualOpen(false);
    } catch {
      setError(t('actionError'));
    } finally {
      setSavingManual(false);
    }
  }

  async function handleGenerateProposals(): Promise<void> {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ad-studio/client-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'propose', locale: uiLocale }),
      });
      if (!response.ok) throw new Error('propose_failed');
      await reloadState();
    } catch {
      setError(t('actionError'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleDecideProposal(proposalId: string, decision: 'approve' | 'decline'): Promise<void> {
    setDecidingId(proposalId);
    setError(null);
    try {
      const response = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/ad-studio/client-requests/proposals/${encodeURIComponent(proposalId)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision, regenerate: true }),
        },
      );
      if (!response.ok) throw new Error('decision_failed');
      const data = (await response.json()) as { proposal: AdShareProposalView };
      setProposals((prev) => prev.map((item) => (item.id === proposalId ? data.proposal : item)));
      await reloadState();
      if (decision === 'approve') router.refresh();
    } catch {
      setError(t('actionError'));
    } finally {
      setDecidingId(null);
    }
  }

  async function handleSendUpdatedVersion(): Promise<void> {
    if (!canCreateShareLink) return;
    setSendingRevision(true);
    setError(null);
    try {
      const latestLink = shareLinks[0] ?? null;
      const appliedIds = feedback.filter((item) => item.status === 'applied').map((item) => item.id);
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ad-studio/share-links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          briefIds: null,
          label: latestLink?.label || projectName,
          expiresInDays: 30,
          revisionNumber: nextRevision,
          revisionNote: revisionNote.trim() || null,
          supersedesLinkId: latestLink?.id ?? null,
          markFeedbackSentIds: appliedIds,
        }),
      });
      if (!response.ok) throw new Error('revision_failed');
      const data = (await response.json()) as { token: string; link: ShareLinkRow };
      setShareLinks((prev) => [data.link, ...prev]);
      setUpdatedShareUrl(shareUrl(window.location.origin, locale, data.token));
      if (appliedIds.length > 0) {
        const sentSet = new Set(appliedIds);
        setFeedback((prev) =>
          prev.map((item) => (sentSet.has(item.id) ? { ...item, status: 'sent_to_client' } : item)),
        );
      }
      setRevisionNote('');
    } catch {
      setError(t('actionError'));
    } finally {
      setSendingRevision(false);
    }
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
      data-testid="client-requests-panel"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('intro')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!aiAvailable || generating || openActionableCount === 0}
            onClick={handleGenerateProposals}
            data-testid="generate-client-proposals-btn"
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {generating ? t('generatingProposals') : t('generateProposals')}
          </button>
          <button
            type="button"
            onClick={() => setManualOpen((open) => !open)}
            data-testid="toggle-manual-request-btn"
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-3.5 text-xs font-medium hover:bg-muted"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('logManualToggle')}
          </button>
        </div>
      </div>

      {feedback.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-y border-border/60 py-2.5">
          <button
            type="button"
            onClick={() => copyText('report', reportMarkdown)}
            data-testid="copy-feedback-report-btn"
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            {copiedFlag === 'report' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copiedFlag === 'report' ? t('copiedAction') : t('copyReport')}
          </button>
          <button
            type="button"
            onClick={downloadMarkdown}
            data-testid="download-feedback-report-btn"
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {t('downloadReport')}
          </button>
          <button
            type="button"
            onClick={() => copyText('fix', fixAgentPrompt)}
            data-testid="copy-fix-agent-btn"
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            {copiedFlag === 'fix' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {copiedFlag === 'fix' ? t('copiedAction') : t('copyFixAgent')}
          </button>
        </div>
      ) : null}

      {manualOpen ? (
        <form
          onSubmit={handleSaveManualRequest}
          className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4"
          data-testid="manual-client-request-form"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              <span>{t('manualClientLabel')}</span>
              <input
                type="text"
                value={manualClientLabel}
                onChange={(event) => setManualClientLabel(event.target.value)}
                placeholder={t('manualClientPlaceholder')}
                className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              <span>{t('manualScopeLabel')}</span>
              <select
                value={manualScope}
                onChange={(event) => setManualScope(event.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
              >
                <option value="__general__">{t('manualGeneralScope')}</option>
                {briefs.map((brief) => (
                  <option key={brief.id} value={brief.id}>
                    {brief.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span>{t('manualCommentLabel')}</span>
            <textarea
              rows={3}
              value={manualComment}
              onChange={(event) => setManualComment(event.target.value)}
              placeholder={t('manualCommentPlaceholder')}
              className="rounded-lg border border-border bg-background p-2.5 text-sm"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={savingManual || !manualComment.trim()}
              className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {savingManual ? t('manualSaving') : t('manualSubmit')}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {canCreateShareLink && (hasAppliedUpdates || updatedShareUrl) ? (
        <div
          className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4"
          data-testid="client-requests-send-revision"
        >
          <div>
            <h3 className="text-sm font-bold text-foreground">{t('sendUpdatedTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('sendUpdatedBody', { revision: nextRevision })}</p>
          </div>
          {updatedShareUrl ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-foreground">{t('updatedLinkReady')}</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={updatedShareUrl}
                  dir="ltr"
                  onFocus={(event) => event.target.select()}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => copyText('link', updatedShareUrl)}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-3.5 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  {copiedFlag === 'link' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copiedFlag === 'link' ? t('copiedAction') : t('copyUpdatedLink')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
                <span>{t('revisionNoteLabel')}</span>
                <input
                  type="text"
                  value={revisionNote}
                  onChange={(event) => setRevisionNote(event.target.value)}
                  placeholder={t('revisionNotePlaceholder')}
                  maxLength={500}
                  className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={sendingRevision}
                onClick={handleSendUpdatedVersion}
                data-testid="send-updated-version-btn"
                className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                {sendingRevision ? t('sendingUpdated') : t('sendUpdatedButton')}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {proposals.length > 0 ? (
        <div className="flex flex-col gap-2.5" data-testid="client-proposals-list">
          <h3 className="text-sm font-semibold">{t('proposalsQueueTitle', { count: proposals.length })}</h3>
          <div className="flex flex-col gap-3">
            {proposals.map((proposal) => {
              const deciding = decidingId === proposal.id;
              return (
                <article
                  key={proposal.id}
                  className="flex flex-col gap-2.5 rounded-xl border border-border bg-background/70 p-4"
                  data-testid={`client-proposal-card-${proposal.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{proposal.title}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {proposal.kind === 'create_new_brief'
                          ? t('newBriefTag')
                          : t('targetBriefTag', { name: proposal.briefName || proposal.briefId || '' })}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        proposal.status === 'applied'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : proposal.status === 'declined'
                            ? 'bg-muted text-muted-foreground'
                            : proposal.status === 'failed'
                              ? 'bg-destructive/15 text-destructive'
                              : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {proposal.status === 'applied'
                        ? t('appliedTag')
                        : proposal.status === 'declined'
                          ? t('declinedTag')
                          : proposal.status === 'failed'
                            ? t('failedTag')
                            : t('pendingTag')}
                    </span>
                  </div>

                  {proposal.clientQuote ? (
                    <p className="rounded-lg bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                      <strong>{t('clientQuotePrefix')}</strong> {proposal.clientQuote}
                    </p>
                  ) : null}

                  <p className="text-xs text-foreground">{proposal.summary}</p>
                  {proposal.rationale ? (
                    <p className="text-xs text-muted-foreground">
                      <strong>{t('rationaleLabel')}</strong> {proposal.rationale}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {proposal.changes.name ? (
                      <span className="rounded-md bg-muted px-2 py-0.5">{t('changesSummaryName', { value: proposal.changes.name })}</span>
                    ) : null}
                    {proposal.changes.voicePreset ? (
                      <span className="rounded-md bg-muted px-2 py-0.5">{t('changesSummaryVoice', { value: proposal.changes.voicePreset })}</span>
                    ) : null}
                    {proposal.changes.videoInstructions ? (
                      <span className="rounded-md bg-muted px-2 py-0.5">
                        {t('changesSummaryVideoInstructions', { value: proposal.changes.videoInstructions })}
                      </span>
                    ) : null}
                    {proposal.changes.scenes?.length ? (
                      <span className="rounded-md bg-muted px-2 py-0.5">
                        {t('changesSummaryScenes', { count: proposal.changes.scenes.length })}
                      </span>
                    ) : null}
                    {proposal.changes.concepts?.length ? (
                      <span className="rounded-md bg-muted px-2 py-0.5">
                        {t('changesSummaryConcepts', { count: proposal.changes.concepts.length })}
                      </span>
                    ) : null}
                    {proposal.changes.headlines?.length ? (
                      <span className="rounded-md bg-muted px-2 py-0.5">
                        {t('changesSummarySearch', {
                          headlines: proposal.changes.headlines.length,
                          descriptions: proposal.changes.descriptions?.length ?? 0,
                        })}
                      </span>
                    ) : null}
                  </div>

                  {proposal.status === 'pending' || proposal.status === 'failed' ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={deciding}
                        onClick={() => handleDecideProposal(proposal.id, 'approve')}
                        data-testid={`approve-proposal-${proposal.id}`}
                        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        {deciding ? t('approvingProposal') : t('approveProposal')}
                      </button>
                      <button
                        type="button"
                        disabled={deciding}
                        onClick={() => handleDecideProposal(proposal.id, 'decline')}
                        data-testid={`decline-proposal-${proposal.id}`}
                        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('declineProposal')}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {feedback.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="client-feedback-queue">
          <h3 className="text-sm font-semibold">{t('feedbackQueueTitle', { count: feedback.length })}</h3>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {feedback.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-xs">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{item.authorName || item.clientLabel}</span>
                    {item.briefName || item.campaignLabel ? (
                      <span className="text-muted-foreground">· {item.briefName || item.campaignLabel}</span>
                    ) : null}
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {t(feedbackVerdictKey(item.verdict))}
                    </span>
                  </div>
                  {item.comment ? <p className="text-foreground">{item.comment}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t(feedbackStatusKey(item.status))}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{formatShareDate(locale, item.createdOn)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : proposals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-center">
          <p className="text-sm font-medium text-foreground">{t('emptyTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('emptyBody')}</p>
        </div>
      ) : null}
    </section>
  );
}
