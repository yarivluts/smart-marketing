'use client';

import * as React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Zap,
  Minimize2,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProposalDiffCard, type ActionProposalData } from './proposal-diff-card';
import { processCopilotQuery, type CopilotContext } from '@/lib/ai/copilot-engine';
import type { CopilotActionProposal } from '@/lib/ai/copilot-types';

/**
 * Bridges the engine's proposal shape to the card's.
 *
 * `ActionProposalData` carries four fields the engine has no opinion on - a display `id`, the
 * `platform` badge, a `status`, and the `diffEntries` the card renders as a before/after
 * table. The before/after pair is the one diff entry the engine does know about, so it is
 * derived rather than invented.
 */
function toActionProposalData(proposal: CopilotActionProposal): ActionProposalData {
  return {
    id: `prop-${proposal.targetId}-${Date.now()}`,
    targetId: proposal.targetId,
    targetLabel: proposal.targetLabel,
    actionType: proposal.actionType,
    impactBadge: proposal.impactBadge,
    beforeValue: proposal.beforeValue,
    afterValue: proposal.afterValue,
    diffEntries: [{ key: proposal.actionType, before: String(proposal.beforeValue), after: String(proposal.afterValue) }],
    ...(proposal.estimatedImpact ? { estimatedImpact: proposal.estimatedImpact } : {}),
    status: 'awaiting_approval',
    ...(proposal.payload ? { payload: proposal.payload } : {}),
  };
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  actionProposal?: ActionProposalData;
  isLoading?: boolean;
}

export interface CopilotChatPanelProps {
  orgId?: string;
  projectId?: string;
  initialMessages?: CopilotMessage[];
  onExecuteProposal?: (proposal: ActionProposalData) => Promise<void> | void;
  onRollbackProposal?: (proposal: ActionProposalData) => Promise<void> | void;
  className?: string;
  embedded?: boolean;
  onClose?: () => void;
  /** The project's real campaigns, so a proposal names one that exists. Without them the engine asks which campaign rather than guessing. */
  targets?: CopilotContext['targets'];
  /** The project's real funnel, so a drop-off answer is measured rather than assumed. */
  funnelSteps?: CopilotContext['funnelSteps'];
}

/** Markdown parsing helper for safe rich text rendering in message bubbles */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  return lines.map((line, lIdx) => {
    // Bold parsing (**text**)
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const lineElements = parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={pIdx} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      // Inline code (`code`)
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={pIdx}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });

    // Bullet points
    if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
      return (
        <li key={lIdx} className="ms-4 list-disc text-xs sm:text-sm my-0.5">
          {lineElements}
        </li>
      );
    }

    // Numbered list (1. 2.)
    if (/^\d+\.\s/.test(line.trim())) {
      return (
        <li key={lIdx} className="ms-4 list-decimal text-xs sm:text-sm my-0.5">
          {lineElements}
        </li>
      );
    }

    return (
      <p key={lIdx} className={cn('text-xs sm:text-sm leading-relaxed', lIdx > 0 && 'mt-1')}>
        {lineElements}
      </p>
    );
  });
}

export function CopilotChatPanel({
  orgId,
  projectId,
  initialMessages,
  onExecuteProposal,
  onRollbackProposal: _onRollbackProposal,
  className,
  embedded = false,
  onClose,
  targets,
  funnelSteps,
}: CopilotChatPanelProps): React.ReactElement {
  const t = useTranslations('Copilot');
  const locale = useLocale();
  const isRtl = locale === 'he';

  const defaultWelcomeMessage: CopilotMessage = {
    id: 'welcome-1',
    role: 'assistant',
    content:
      locale === 'he'
        ? 'שלום! אני ה-AI Growth Copilot שלך. כיצד אוכל לעזור לך לייעל קמפיינים, לבדוק מדדים או לבצע שינויי תקציב היום?'
        : "Hello! I'm your AI Growth Copilot. How can I assist you with optimizing campaigns, checking metrics, or reallocating budgets today?",
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const [messages, setMessages] = React.useState<CopilotMessage[]>(
    initialMessages ?? [defaultWelcomeMessage],
  );
  const [input, setInput] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [executingProposalId, setExecutingProposalId] = React.useState<string | null>(null);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = React.useCallback(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const quickPromptChips = [
    {
      label: locale === 'he' ? 'מודעות מובילות' : 'Top Ads',
      query: locale === 'he' ? 'אילו מודעות הכי רווחיות השבוע?' : 'What are top ads this week?',
    },
    {
      label: locale === 'he' ? 'הגדל תקציב' : 'Scale Budget',
      query:
        locale === 'he'
          ? 'הגדל תקציב לקמפיין הריטרגטינג ל-$250'
          : 'Increase budget for retargeting campaign to $250',
    },
    {
      label: locale === 'he' ? 'קמפיין חדש' : 'New Campaign',
      query:
        locale === 'he'
          ? 'צור קמפיין חדש לעורכי דין'
          : 'Create a new campaign for lawyers',
    },
    {
      label: locale === 'he' ? 'איזון תקציבי' : 'Budget Rebalance',
      query:
        locale === 'he'
          ? 'העבר תקציב מגוגל למטא'
          : 'Reallocate Google to Meta budget',
    },
  ];

  async function handleSend(customQuery?: string) {
    const textToSend = customQuery || input;
    if (!textToSend.trim()) return;

    const userMessageId = `user-${Date.now()}`;
    const userMsg: CopilotMessage = {
      id: userMessageId,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customQuery) {
      setInput('');
    }

    setIsTyping(true);

    /*
      Delegates to lib/ai/copilot-engine, which resolves a campaign that actually exists and
      declines the questions it has no measurement for.

      This used to be a private copy of that engine: a chain of queryLower.includes() checks
      returning canned replies - "I identified an optimization opportunity to scale the Meta
      Retargeting campaign", "I've analyzed your query" - asserting analysis that never
      happened, attached to proposals against hardcoded ids like tgt-meta-retargeting at
      "$150/day" with "+32% projected conversions". handleApprove POSTs an approved proposal
      to the real automation endpoint, so those ids had a path to a live ad account.

      The 200ms delay is kept deliberately: it drives the typing indicator, and removing it
      would make the reply appear before the indicator ever rendered.
    */
    setTimeout(() => {
      setIsTyping(false);

      const result = processCopilotQuery(textToSend, {
        locale: locale === 'he' ? 'he' : 'en',
        orgId,
        projectId,
        targets,
        funnelSteps,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: result.message.id,
          role: 'assistant',
          content: result.message.content,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          ...(result.actionProposal ? { actionProposal: toActionProposalData(result.actionProposal) } : {}),
        },
      ]);
    }, 200);
  }

  function appendSystemMessage(content: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }

  /**
   * Reports what actually happened.
   *
   * Two separate ways this used to claim success on a failure: the `catch` branch appended
   * the very same "Action executed successfully! Rollback is available in audit log."
   * message as the happy path, and the happy path itself never inspected the response —
   * `fetch` only rejects on a network error, so a 400 or a 403 from the propose endpoint
   * resolved normally and was reported as executed. Either way the user was sent looking
   * for a rollback entry that was never written.
   */
  async function handleApprove(proposal: ActionProposalData) {
    setIsExecuting(true);
    setExecutingProposalId(proposal.targetId);
    try {
      if (onExecuteProposal) {
        await onExecuteProposal(proposal);
      } else if (orgId && projectId) {
        const res = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/propose`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            targetId: proposal.targetId,
            actionType: proposal.actionType,
            afterDailyBudgetUsd: proposal.payload?.dailyBudgetUsd,
          }),
        });
        if (!res.ok) {
          throw new Error(`propose failed with ${res.status}`);
        }
      }

      appendSystemMessage(t('actionExecuted'));
    } catch {
      appendSystemMessage(t('actionFailed'));
    } finally {
      setIsExecuting(false);
      setExecutingProposalId(null);
    }
  }

  function handleClearChat() {
    setMessages([defaultWelcomeMessage]);
  }

  return (
    <div
      data-testid="copilot-chat-container"
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn(
        'flex flex-col rounded-2xl border border-border/80 bg-card shadow-soft overflow-hidden transition-all',
        embedded ? 'h-full min-h-[500px]' : 'h-[620px] w-full',
        className,
      )}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                {t('drawerTitle') || 'AI Growth Copilot'}
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <Zap className="h-3 w-3" />
                <span>{t('badgeHybridEngine') || 'Hybrid Action Engine'}</span>
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('drawerSubtitle') || 'Natural language marketing actions & instant insights'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleClearChat}
            title={locale === 'he' ? 'נקה שיחה' : 'Clear Chat'}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Message Stream */}
      <div
        data-testid="message-stream"
        className="flex-1 overflow-y-auto p-4 space-y-4 text-sm"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-6">
            <Sparkles className="h-8 w-8 text-primary/40 mb-2" />
            <p className="font-semibold text-foreground">{t('emptyTitle') || 'How can I assist your campaigns?'}</p>
            <p className="text-xs max-w-sm mt-1">{t('emptySubtitle') || 'Ask for performance breakdowns or budget updates.'}</p>
          </div>
        ) : (
          messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                data-testid={`message-${m.role}`}
                className={cn(
                  'flex items-start gap-2.5 transition-all',
                  isUser ? 'justify-end ms-auto max-w-[85%]' : 'justify-start me-auto max-w-[90%]',
                )}
              >
                {!isUser && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-1 shadow-xs">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div className="flex flex-col gap-1 min-w-0">
                  <div
                    className={cn(
                      'rounded-2xl p-3.5 shadow-xs transition-all',
                      isUser
                        ? 'bg-primary text-primary-foreground rounded-ee-xs'
                        : 'bg-muted/70 text-foreground border border-border/60 rounded-es-xs',
                    )}
                  >
                    <div dir="auto" className="leading-relaxed whitespace-pre-wrap">
                      {isUser ? m.content : renderMarkdown(m.content)}
                    </div>

                    {/* Action Proposal Card */}
                    {m.actionProposal && (
                      <div className="mt-3">
                        <ProposalDiffCard
                          proposal={m.actionProposal}
                          onApprove={handleApprove}
                          isLoading={isExecuting && executingProposalId === m.actionProposal.targetId}
                          showActions={true}
                        />
                      </div>
                    )}
                  </div>

                  <span
                    className={cn(
                      'text-[10px] text-muted-foreground px-1',
                      isUser ? 'text-end' : 'text-start',
                    )}
                    dir="ltr"
                  >
                    {m.timestamp}
                  </span>
                </div>

                {isUser && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground mt-1 shadow-xs">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Typing Indicator */}
        {isTyping && (
          <div
            data-testid="copilot-typing-indicator"
            className="flex items-center gap-2 justify-start me-auto text-muted-foreground"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1 rounded-2xl bg-muted/60 px-4 py-2.5 border border-border/50">
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Chips */}
      <div className="border-t border-border/60 bg-muted/20 px-3.5 py-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {quickPromptChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(chip.query)}
              className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground hover:bg-accent/10 hover:border-primary/40 hover:text-primary transition-all cursor-pointer active:scale-95 shadow-xs"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              <span>{chip.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input Composer Area */}
      <div className="border-t border-border bg-background p-3 flex gap-2">
        <input
          data-testid="copilot-input"
          value={input}
          dir="auto"
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('inputPlaceholder') || (locale === 'he' ? 'שאל שאלה או תן פקודה...' : 'Ask a question or issue a command...')}
          className="flex-1 rounded-xl border border-input bg-card px-3.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"
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
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
        >
          <span>{t('sendButton') || (locale === 'he' ? 'שלח' : 'Send')}</span>
          <Send className="ms-1.5 h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
