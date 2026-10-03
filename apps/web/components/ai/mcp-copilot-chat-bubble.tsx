'use client';

import * as React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  Bot,
  Sparkles,
  Send,
  X,
  Minimize2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Wrench,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActionProposalData } from '@/components/automation/proposal-diff-card';
import type {
  CopilotToolCall,
  CopilotQuickAction,
  CopilotChatResponseBody,
} from '@/app/api/orgs/[orgId]/projects/[projectId]/copilot/chat/route';

export interface McpCopilotChatBubbleProps {
  orgId: string;
  projectId: string;
  initialOpen?: boolean;
  className?: string;
}

export interface CopilotBubbleMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: CopilotToolCall[];
  actionProposal?: ActionProposalData;
  quickActions?: CopilotQuickAction[];
}

/** Markdown parsing helper for structured rich text rendering in assistant messages */
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
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-primary"
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
        <li key={lIdx} className="ms-4 list-disc text-xs sm:text-sm my-0.5 leading-relaxed">
          {lineElements}
        </li>
      );
    }

    // Numbered list (1. 2.)
    if (/^\d+\.\s/.test(line.trim())) {
      return (
        <li key={lIdx} className="ms-4 list-decimal text-xs sm:text-sm my-0.5 leading-relaxed">
          {lineElements}
        </li>
      );
    }

    // Empty line / paragraph break
    if (line.trim().length === 0) {
      return <div key={lIdx} className="h-1.5" />;
    }

    return (
      <p key={lIdx} className={cn('text-xs sm:text-sm leading-relaxed', lIdx > 0 && 'mt-1')}>
        {lineElements}
      </p>
    );
  });
}

export function McpCopilotChatBubble({
  orgId,
  projectId,
  initialOpen = false,
  className,
}: McpCopilotChatBubbleProps): React.ReactElement {
  const t = useTranslations('CopilotBubble');
  const locale = useLocale();
  const isRtl = locale === 'he';
  const pathname = usePathname();
  const router = useRouter();

  const [isOpen, setIsOpen] = React.useState(initialOpen);
  const [input, setInput] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const [expandedToolCalls, setExpandedToolCalls] = React.useState<Record<string, boolean>>({});
  const [executingActionId, setExecutingActionId] = React.useState<string | null>(null);
  const [executedActionIds, setExecutedActionIds] = React.useState<Set<string>>(new Set());
  const [actionErrors, setActionErrors] = React.useState<Record<string, string>>({});

  const initialWelcomeMessage = React.useMemo<CopilotBubbleMessage>(
    () => ({
      id: 'welcome-0',
      role: 'assistant',
      content: t('welcomeMessage'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }),
    [t],
  );

  const [messages, setMessages] = React.useState<CopilotBubbleMessage[]>([initialWelcomeMessage]);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const scrollToBottom = React.useCallback(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages, isTyping, scrollToBottom]);

  // Global Keyboard shortcut: Cmd+J or Ctrl+J to toggle
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const toggleToolCall = (toolKey: string) => {
    setExpandedToolCalls((prev) => ({
      ...prev,
      [toolKey]: !prev[toolKey],
    }));
  };

  const handleClear = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: t('welcomeMessage'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const handleSend = async (customPrompt?: string) => {
    const textToSend = (customPrompt || input).trim();
    if (!textToSend || isTyping) return;

    const userMessage: CopilotBubbleMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customPrompt) {
      setInput('');
    }
    setIsTyping(true);

    try {
      const res = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/copilot/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend,
            currentPath: pathname,
            locale,
          }),
        },
      );

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const data: CopilotChatResponseBody = await res.json();
      if (data && data.message) {
        setMessages((prev) => [...prev, data.message]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            locale === 'he'
              ? 'אירעה שגיאה זמנית בהתחברות לשרת ה-MCP. אנא נסה שוב או בדוק את חיבור הרשת.'
              : 'A temporary error occurred while querying the MCP service. Please try again or check network connectivity.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleExecuteAction = async (proposal: ActionProposalData) => {
    const propId = proposal.id || proposal.targetId;
    setExecutingActionId(propId);
    setActionErrors((prev) => {
      const next = { ...prev };
      delete next[propId];
      return next;
    });

    try {
      const payload = {
        targetId: proposal.targetId,
        actionType: proposal.actionType,
        afterDailyBudgetUsd:
          typeof proposal.payload?.afterDailyBudgetUsd === 'number'
            ? proposal.payload.afterDailyBudgetUsd
            : typeof proposal.afterValue === 'number'
              ? proposal.afterValue
              : undefined,
      };

      const res = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/automation/actions/quick-execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error ${res.status}`);
      }

      setExecutedActionIds((prev) => new Set([...prev, propId]));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('actionFailed');
      setActionErrors((prev) => ({ ...prev, [propId]: msg }));
    } finally {
      setExecutingActionId(null);
    }
  };

  const quickPrompts = [
    { label: t('quickPromptMetrics'), query: 'Query CAC & ROAS' },
    { label: t('quickPromptBudget'), query: 'Scale Retargeting budget to $250' },
    { label: t('quickPromptFunnel'), query: 'Analyze funnel drop-off' },
    { label: t('quickPromptCohorts'), query: 'Show retention cohorts' },
    { label: t('quickPromptAudit'), query: 'Audit installation gaps' },
    { label: t('quickPromptScript'), query: 'Get tracking script' },
    { label: t('quickPromptMcpGuide'), query: 'How to connect Claude / Cursor via MCP' },
  ];

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn('pointer-events-none fixed inset-0 z-50 overflow-hidden', className)}
      data-testid="copilot-bubble-root"
    >
      {/* Floating Trigger Docked Bubble */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          data-testid="copilot-bubble-trigger"
          title={t('floatingTooltip')}
          aria-expanded={isOpen}
          aria-label={t('floatingTooltip')}
          className={cn(
            'pointer-events-auto group absolute bottom-20 md:bottom-6 end-6 flex items-center gap-2.5 rounded-full p-2.5 sm:px-4 sm:py-3',
            'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground font-semibold text-xs sm:text-sm shadow-xl',
            'border border-primary-foreground/20 hover:scale-105 hover:shadow-2xl transition-all duration-200 cursor-pointer',
            'ring-4 ring-primary/20 animate-in fade-in zoom-in-95',
          )}
        >
          <div className="relative flex items-center justify-center">
            <Bot className="h-5 w-5 sm:h-6 sm:w-6 transition-transform group-hover:rotate-12" />
            <span
              className="absolute -top-1 -end-1 flex h-2.5 w-2.5 items-center justify-center"
              title={t('mcpConnected')}
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </div>
          <span className="hidden sm:inline font-medium tracking-tight">
            {t('floatingTrigger')}
          </span>
          <span className="hidden lg:inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] font-mono text-primary-foreground/90">
            ⌘J
          </span>
        </button>
      )}

      {/* Expanded Floating Chat Panel Window */}
      {isOpen && (
        <div
          data-testid="copilot-chat-window"
          className={cn(
            'pointer-events-auto absolute bottom-20 md:bottom-6 end-4 sm:end-6 flex flex-col',
            'w-[calc(100vw-2rem)] sm:w-[420px] h-[580px] max-h-[85vh]',
            'rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden',
            'animate-in fade-in slide-in-from-bottom-4 duration-200',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Bot className="h-4 w-4" />
                <span
                  className="absolute -top-0.5 -end-0.5 flex h-2 w-2 items-center justify-center"
                  title={t('mcpConnected')}
                >
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs sm:text-sm font-bold text-foreground truncate tracking-tight">
                    {t('headerTitle')}
                  </h3>
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 text-[9px] font-medium text-emerald-600 dark:text-emerald-400"
                    title={t('mcpConnected')}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {t('mcpToolBadge')}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {t('contextPrefix')}{' '}
                  <span className="font-mono text-foreground/80">
                    {pathname.replace(`/orgs/${orgId}/projects/${projectId}`, '') || '/'}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleClear}
                title={t('clearChat')}
                data-testid="copilot-clear-chat"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title={t('minimize')}
                data-testid="copilot-minimize-chat"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title={t('close')}
                data-testid="copilot-close-chat"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Message Thread Scroll Area */}
          <div
            data-testid="copilot-messages-container"
            className="flex-1 overflow-y-auto p-4 space-y-4 text-xs sm:text-sm"
          >
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id || index}
                  className={cn(
                    'flex flex-col',
                    isUser ? 'items-end' : 'items-start',
                  )}
                  data-testid={`copilot-message-${msg.role}`}
                >
                  <div
                    className={cn(
                      'max-w-[88%] rounded-2xl p-3 shadow-xs transition-all',
                      isUser
                        ? 'bg-primary text-primary-foreground font-medium rounded-tr-xs rtl:rounded-tr-2xl rtl:rounded-tl-xs'
                        : 'bg-muted/70 border border-border/60 text-foreground rounded-tl-xs rtl:rounded-tl-2xl rtl:rounded-tr-xs',
                    )}
                  >
                    {!isUser && (
                      <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold text-muted-foreground">
                        <Sparkles className="h-3 w-3 text-primary" />
                        <span>MCP Copilot</span>
                        <span className="text-muted-foreground/60">•</span>
                        <span>{msg.timestamp}</span>
                      </div>
                    )}

                    {/* Text content rendered as rich markdown */}
                    <div className="space-y-1">
                      {isUser ? msg.content : renderMarkdown(msg.content)}
                    </div>

                    {/* Collapsible MCP Tool Calls */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-3 space-y-1.5" data-testid="mcp-tool-calls-container">
                        {msg.toolCalls.map((tc, tcIdx) => {
                          const callKey = `${msg.id}-tc-${tcIdx}`;
                          const isExpanded = Boolean(expandedToolCalls[callKey]);
                          return (
                            <div
                              key={callKey}
                              data-testid="mcp-tool-call-pill"
                              className="rounded-xl border border-border/70 bg-background/80 overflow-hidden text-[11px]"
                            >
                              <button
                                type="button"
                                onClick={() => toggleToolCall(callKey)}
                                className="w-full flex items-center justify-between p-2 text-start font-mono hover:bg-muted/40 transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <Wrench className="h-3.5 w-3.5 text-primary shrink-0" />
                                  <span className="font-semibold text-foreground truncate">
                                    {tc.tool}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 ms-2">
                                  <span className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.2 font-mono text-[9px]">
                                    {t('toolCallLatency', { ms: tc.latencyMs })}
                                  </span>
                                  {isExpanded ? (
                                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                </div>
                              </button>

                              {isExpanded && (
                                <div className="p-2.5 border-t border-border/50 bg-muted/20 space-y-2">
                                  <div>
                                    <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                                      {t('toolCallArgs')}:
                                    </div>
                                    <pre className="rounded-lg bg-muted/70 p-2 font-mono text-[10px] text-foreground overflow-x-auto whitespace-pre-wrap">
                                      {JSON.stringify(tc.input, null, 2)}
                                    </pre>
                                  </div>
                                  {tc.resultPreview && (
                                    <div>
                                      <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                                        Preview:
                                      </div>
                                      <div className="rounded-lg bg-background border border-border/50 p-2 text-[10px] font-mono text-muted-foreground">
                                        {tc.resultPreview}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Action Proposal Execution Card */}
                    {msg.actionProposal && (
                      <div
                        data-testid="copilot-action-proposal-card"
                        className="mt-3 rounded-xl border border-primary/20 bg-background/90 p-3 shadow-xs space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                          <div className="min-w-0">
                            <h4 className="font-bold text-xs text-foreground truncate">
                              {msg.actionProposal.targetLabel}
                            </h4>
                            <div className="text-[10px] text-muted-foreground capitalize">
                              {msg.actionProposal.actionType.replace(/_/g, ' ')}
                            </div>
                          </div>
                          {msg.actionProposal.impactBadge && (
                            <span className="rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-600 dark:text-purple-300 px-2 py-0.5 text-[9px] font-bold uppercase">
                              {msg.actionProposal.impactBadge} impact
                            </span>
                          )}
                        </div>

                        {/* Diff before / after */}
                        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2 text-[11px] border border-border/40">
                          <div>
                            <span className="text-[9px] font-semibold uppercase text-muted-foreground">
                              Before:
                            </span>
                            <div className="line-through font-medium text-muted-foreground truncate">
                              {String(msg.actionProposal.beforeValue ?? '—')}
                            </div>
                          </div>
                          <div>
                            <span className="text-[9px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                              After:
                            </span>
                            <div className="font-bold text-emerald-600 dark:text-emerald-400 truncate">
                              {String(msg.actionProposal.afterValue ?? '—')}
                            </div>
                          </div>
                        </div>

                        {msg.actionProposal.estimatedImpact && (
                          <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-primary shrink-0" />
                            <span className="truncate">{msg.actionProposal.estimatedImpact}</span>
                          </div>
                        )}

                        {/* Execution Error Notice */}
                        {actionErrors[msg.actionProposal.id || msg.actionProposal.targetId] && (
                          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2 text-[10px] text-destructive flex items-center gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              {actionErrors[msg.actionProposal.id || msg.actionProposal.targetId]}
                            </span>
                          </div>
                        )}

                        {/* Execute Action Button or Executed Badge */}
                        {executedActionIds.has(
                          msg.actionProposal.id || msg.actionProposal.targetId,
                        ) ? (
                          <div
                            data-testid="copilot-action-executed-badge"
                            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{t('actionExecuted')}</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleExecuteAction(msg.actionProposal!)}
                            disabled={executingActionId === (msg.actionProposal.id || msg.actionProposal.targetId)}
                            data-testid="copilot-execute-action-btn"
                            className={cn(
                              'w-full flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-bold transition-all cursor-pointer shadow-xs',
                              'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
                            )}
                          >
                            {executingActionId === (msg.actionProposal.id || msg.actionProposal.targetId) ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>{t('actionExecuting')}</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5" />
                                <span>{t('executeAction')}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Quick Navigation Action Buttons */}
                    {msg.quickActions && msg.quickActions.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5" data-testid="copilot-quick-actions">
                        {msg.quickActions.map((qa, qaIdx) => (
                          <button
                            key={qaIdx}
                            type="button"
                            onClick={() => router.push(qa.href)}
                            data-testid="copilot-quick-action-link"
                            className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-background/90 px-2 py-1 text-[11px] font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
                          >
                            <span>{qa.label}</span>
                            {isRtl ? (
                              <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {isUser && (
                    <span className="text-[9px] text-muted-foreground mt-1 me-1">
                      {msg.timestamp}
                    </span>
                  )}
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs p-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>MCP handshaking...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Carousel / Chips */}
          <div className="border-t border-border/40 bg-muted/20 px-3 py-2 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {quickPrompts.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(chip.query)}
                  disabled={isTyping}
                  data-testid="copilot-quick-prompt-chip"
                  className="shrink-0 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 border-t border-border/60 bg-card p-3 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('inputPlaceholder')}
              disabled={isTyping}
              data-testid="copilot-chat-input"
              className="flex-1 rounded-xl border border-border/80 bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              title={t('send')}
              data-testid="copilot-send-button"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isTyping ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className={cn('h-3.5 w-3.5', isRtl && 'rotate-180')} />
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
