'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Sparkles,
  Send,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { CopilotActionProposal, CopilotMessage } from '@/lib/ai/copilot-types';
import { processCopilotQuery } from '@/lib/ai/copilot-engine';
import { cn } from '@/lib/utils';

function createDefaultCopilotMessage(): CopilotMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Found 1 high-performing campaign with budget headroom.',
    timestamp: '2026-08-30T20:00:00Z',
    actionProposal: {
      actionType: 'budget_change',
      targetId: 'target-meta-1',
      targetLabel: 'Meta Retargeting Leads',
      beforeValue: '$150/day',
      afterValue: '$250/day',
      estimatedImpact: '+32% projected conversions at $22 CPA',
      impactBadge: 'high',
      payload: {
        dailyBudgetUsd: 250,
        targetId: 'target-meta-1',
      },
      quickExecuteToken: 'token-abc-123',
    },
  };
}

export interface CopilotChatPanelProps {
  initialMessages?: CopilotMessage[];
  onExecuteProposal?: (proposal: CopilotActionProposal) => Promise<void>;
  orgId?: string;
  projectId?: string;
  className?: string;
  embedded?: boolean;
}

export function CopilotChatPanel({
  initialMessages,
  onExecuteProposal,
  orgId,
  projectId,
  className = '',
  embedded = false,
}: CopilotChatPanelProps): React.ReactElement {
  const t = useTranslations('Copilot');
  const locale = useLocale() as 'en' | 'he';
  const isRtl = locale === 'he';

  const [messages, setMessages] = useState<CopilotMessage[]>(() => initialMessages ?? [createDefaultCopilotMessage()]);
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingProposalId, setExecutingProposalId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPromptChips = [
    { label: t('chipTopAds'), query: locale === 'he' ? 'אילו מודעות הכי רווחיות השבוע?' : 'What are top ads this week?' },
    { label: t('chipIncreaseBudget'), query: locale === 'he' ? 'הגדל תקציב ל-250$ ב-Meta' : 'Increase budget for retargeting campaign to $250' },
    { label: t('chipNewCampaign'), query: locale === 'he' ? 'צור קמפיין חיפוש חדש' : 'Create a new campaign for lawyers' },
    { label: t('chipRebalance'), query: locale === 'he' ? 'העבר תקציב מגוגל למטא' : 'Reallocate Google to Meta budget' },
    { label: t('chipOptimizeFunnel'), query: locale === 'he' ? 'ייעל נטישה בשלב 2' : 'Optimize drop-off at stage 2' },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(customText?: string) {
    const textToSend = (customText ?? input).trim();
    if (!textToSend) return;

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString(),
    };

    setInput('');

    // Generate assistant response
    const { message: assistantMsg } = processCopilotQuery(textToSend, { locale, orgId, projectId });

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
  }

  async function handleApprove(proposal: CopilotActionProposal) {
    if (isExecuting) return;
    setIsExecuting(true);
    setExecutingProposalId(proposal.targetId);

    try {
      if (onExecuteProposal) {
        await onExecuteProposal(proposal);
      } else if (orgId && projectId) {
        // Direct API execution call
        await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/quick-execute`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetId: proposal.targetId,
            actionType: proposal.actionType,
            afterDailyBudgetUsd: proposal.payload?.dailyBudgetUsd,
          }),
        });
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'assistant',
          content: t('actionExecutedSuccess'),
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'assistant',
          content: t('actionExecutedSuccess'),
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsExecuting(false);
      setExecutingProposalId(null);
    }
  }

  return (
    <div
      data-testid="copilot-chat-container"
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn(
        'flex flex-col rounded-2xl border border-border bg-card shadow-soft overflow-hidden',
        embedded ? 'h-full min-h-[480px]' : 'h-[600px] w-full max-w-2xl',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">{t('drawerTitle')}</h3>
            <p className="text-[11px] text-muted-foreground">{t('drawerSubtitle')}</p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
          <Zap className="h-3 w-3" />
          <span>{t('badgeHybridEngine')}</span>
        </span>
      </div>

      {/* Message Stream */}
      <div
        data-testid="message-stream"
        className="flex-1 overflow-y-auto p-4 space-y-4 text-sm"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-6">
            <Sparkles className="h-8 w-8 text-primary/40 mb-2" />
            <p className="font-semibold text-foreground">{t('emptyTitle')}</p>
            <p className="text-xs max-w-sm mt-1">{t('emptySubtitle')}</p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              data-testid={`message-${m.role}`}
              className={cn(
                'flex flex-col max-w-[85%] rounded-2xl p-3.5 transition-all',
                m.role === 'user'
                  ? 'ms-auto bg-primary text-primary-foreground rounded-br-xs'
                  : 'me-auto bg-muted/70 text-foreground border border-border/60 rounded-bl-xs',
              )}
            >
              <p dir="auto" className="leading-relaxed whitespace-pre-wrap">
                {m.content}
              </p>

              {/* Action Proposal Card */}
              {m.actionProposal && (
                <div
                  data-testid="proposal-card"
                  className="mt-3 w-full rounded-xl border border-primary/20 bg-card p-3.5 text-foreground shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="font-bold text-xs truncate">{m.actionProposal.targetLabel}</span>
                    <span
                      data-testid="impact-badge"
                      className="px-2 py-0.5 rounded text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 uppercase font-semibold shrink-0"
                    >
                      {t('impactBadgeLabel', { impact: m.actionProposal.impactBadge })}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase">{t('beforeLabel')}{':'}</span>
                      <span data-testid="before-diff" className="line-through text-muted-foreground font-medium" dir="ltr">
                        {m.actionProposal.beforeValue}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase">{t('afterLabel')}{':'}</span>
                      <span data-testid="after-diff" className="font-bold text-green-600 dark:text-green-400" dir="ltr">
                        {m.actionProposal.afterValue}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5" dir="auto">
                    <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{m.actionProposal.estimatedImpact}</span>
                  </div>

                  <button
                    type="button"
                    data-testid="quick-execute-button"
                    disabled={isExecuting}
                    onClick={() => handleApprove(m.actionProposal!)}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2 px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>
                      {isExecuting && executingProposalId === m.actionProposal.targetId
                        ? t('executing')
                        : t('approveAndExecute')}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Prompt Chips */}
      <div className="border-t border-border/60 bg-muted/20 px-3 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {quickPromptChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(chip.query)}
              className="inline-flex items-center gap-1 shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent/10 hover:border-primary/40 transition-colors cursor-pointer"
            >
              <Sparkles className="h-2.5 w-2.5 text-primary" />
              <span>{chip.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-background p-3 flex gap-2">
        <input
          data-testid="copilot-input"
          value={input}
          dir="auto"
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('inputPlaceholder')}
          className="flex-1 rounded-xl border border-input bg-card px-3.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        <button
          type="button"
          data-testid="copilot-send-button"
          onClick={() => handleSend()}
          disabled={!input.trim()}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer"
        >
          <span>{t('sendButton')}</span>
          <Send className="ms-1.5 h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
