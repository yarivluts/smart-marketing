'use client';

import * as React from 'react';
import {
  Sparkles,
  BookOpen,
  Brain,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Search,
  Bot,
  X,
  TrendingUp,
  Target,
  ArrowRight,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { PageGuideData } from '@/lib/guides/page-guides-data';
import { useSafeGuideIntl } from './use-safe-guide-intl';

export interface PageGuideModalProps {
  guide: PageGuideData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAskCopilot?: (queryPrompt: string) => void;
}

type TabType = 'overview' | 'terms' | 'theory' | 'actions';

export function PageGuideModal({
  guide,
  open,
  onOpenChange,
  onAskCopilot,
}: PageGuideModalProps): React.ReactElement {
  const { t, locale } = useSafeGuideIntl();
  const isRtl = locale === 'he';

  const [activeTab, setActiveTab] = React.useState<TabType>('overview');
  const [termSearch, setTermSearch] = React.useState('');

  // Reset search and tab on modal open
  React.useEffect(() => {
    if (open) {
      setActiveTab('overview');
      setTermSearch('');
    }
  }, [open]);

  const filteredTerms = React.useMemo(() => {
    if (!termSearch.trim()) return guide.terms;
    const q = termSearch.toLowerCase().trim();
    return guide.terms.filter(
      (term) =>
        term.term.toLowerCase().includes(q) ||
        term.simpleDefinition.toLowerCase().includes(q) ||
        term.analogy.toLowerCase().includes(q) ||
        term.whyItMatters.toLowerCase().includes(q),
    );
  }, [guide.terms, termSearch]);

  const handleTriggerCopilot = () => {
    onOpenChange(false);
    if (onAskCopilot) {
      onAskCopilot(guide.copilotQueryPrompt);
    } else {
      // Dispatch global keyboard shortcut event (Cmd+J / Ctrl+J)
      const event = new KeyboardEvent('keydown', {
        key: 'j',
        code: 'KeyJ',
        ctrlKey: true,
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className={cn(
          'p-0 max-w-3xl w-[95vw] sm:w-[720px] max-h-[88vh] flex flex-col overflow-hidden',
          'border border-border/80 bg-card/95 shadow-2xl backdrop-blur-xl rounded-2xl',
        )}
      >
        <div dir={isRtl ? 'rtl' : 'ltr'} className="flex flex-col h-full overflow-hidden text-start">
          {/* Header Banner */}
          <div className="relative border-b border-border/60 bg-gradient-to-br from-primary/10 via-background to-muted/40 p-5 sm:p-6 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/25 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    <Sparkles className="h-3 w-3" />
                    {t('modalBadge')}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {guide.badge}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                  {guide.title}
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {guide.subtitle}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label={t('close')}
                data-testid="page-guide-close-btn"
                className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation Tabs Bar */}
            <div className="flex items-center gap-1 mt-5 border-t border-border/40 pt-3 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                data-testid="page-guide-tab-overview"
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0',
                  activeTab === 'overview'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                <Info className="h-3.5 w-3.5" />
                <span>{t('tabOverview')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('terms')}
                data-testid="page-guide-tab-terms"
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0',
                  activeTab === 'terms'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>{t('tabTerms')}</span>
                <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">
                  {guide.terms.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('theory')}
                data-testid="page-guide-tab-theory"
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0',
                  activeTab === 'theory'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                <Brain className="h-3.5 w-3.5" />
                <span>{t('tabTheory')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('actions')}
                data-testid="page-guide-tab-actions"
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0',
                  activeTab === 'actions'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                <Target className="h-3.5 w-3.5" />
                <span>{t('tabActions')}</span>
              </button>
            </div>
          </div>

          {/* Scrollable Tab Body Content */}
          <div
            data-testid="page-guide-content-area"
            className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-sm"
          >
            {/* Tab 1: Overview */}
            {activeTab === 'overview' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-primary font-bold text-sm mb-2">
                    <Lightbulb className="h-4 w-4 shrink-0" />
                    <span>{t('whatItIsHeading')}</span>
                  </div>
                  <p className="text-foreground/90 text-xs sm:text-sm leading-relaxed">
                    {guide.simpleExplanation.whatItIs}
                  </p>
                </div>

                <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 space-y-2">
                  <div className="flex items-center gap-2 text-foreground font-bold text-sm">
                    <Target className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>{t('whyYouCareHeading')}</span>
                  </div>
                  <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                    {guide.simpleExplanation.whyYouCare}
                  </p>
                </div>

                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5 space-y-2">
                  <div className="flex items-center gap-2 text-foreground font-bold text-sm">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <span>{t('summaryHeading')}</span>
                  </div>
                  <p className="text-foreground/90 text-xs sm:text-sm leading-relaxed">
                    {guide.simpleExplanation.plainEnglishSummary}
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: Key Terms & Glossary */}
            {activeTab === 'terms' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={termSearch}
                    onChange={(e) => setTermSearch(e.target.value)}
                    placeholder={t('searchTermsPlaceholder')}
                    data-testid="page-guide-term-search"
                    className="w-full rounded-xl border border-border/80 bg-background ps-9 pe-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
                  />
                </div>

                {filteredTerms.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    {t('noTermsFound')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {filteredTerms.map((item, idx) => (
                      <div
                        key={idx}
                        data-testid="page-guide-term-card"
                        className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs space-y-3 hover:border-primary/40 transition-colors"
                      >
                        <div className="border-b border-border/50 pb-2">
                          <h4 className="font-bold text-sm text-foreground tracking-tight">
                            {item.term}
                          </h4>
                          <p className="mt-1 text-xs text-foreground/85 leading-relaxed">
                            {item.simpleDefinition}
                          </p>
                        </div>

                        {/* Plain Analogy */}
                        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-900 dark:text-amber-300">
                          <span className="font-semibold block mb-0.5 text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            💡 {t('termAnalogy')}:
                          </span>
                          <span className="text-[11px] sm:text-xs leading-relaxed">
                            {item.analogy}
                          </span>
                        </div>

                        {/* Why it Matters */}
                        <div className="text-[11px] sm:text-xs text-muted-foreground">
                          <strong className="text-foreground font-semibold">
                            {t('termWhyMatters')}:
                          </strong>{' '}
                          {item.whyItMatters}
                        </div>

                        {/* Formula or Example */}
                        {item.formulaOrExample && (
                          <div className="rounded-lg bg-muted/60 p-2 font-mono text-[10px] text-primary truncate" dir="ltr">
                            {item.formulaOrExample}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Marketing Theory & Economics */}
            {activeTab === 'theory' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* Core Concept */}
                <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 space-y-2">
                  <div className="flex items-center gap-2 text-foreground font-bold text-sm">
                    <Brain className="h-4 w-4 text-purple-500 shrink-0" />
                    <span>{t('coreConceptLabel')}</span>
                  </div>
                  <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                    {guide.theory.coreConcept}
                  </p>
                </div>

                {/* Economic Principles */}
                <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 text-foreground font-bold text-sm">
                    <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>{t('principlesLabel')}</span>
                  </div>
                  <ul className="space-y-2">
                    {guide.theory.economicPrinciples.map((principle, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{principle}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Common Mistakes */}
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 text-destructive font-bold text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{t('pitfallsLabel')}</span>
                  </div>
                  <ul className="space-y-2">
                    {guide.theory.commonMistakes.map((mistake, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-destructive/90 leading-relaxed">
                        <span className="font-bold shrink-0">•</span>
                        <span>{mistake}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Benchmark */}
                {guide.theory.industryBenchmark && (
                  <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs sm:text-sm text-blue-900 dark:text-blue-300 flex items-start gap-2.5">
                    <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-semibold mb-0.5">
                        {t('benchmarkLabel')}:
                      </strong>
                      <span>{guide.theory.industryBenchmark}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Action Playbook */}
            {activeTab === 'actions' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* Daily Routine */}
                <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 text-foreground font-bold text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>{t('dailyRoutineLabel')}</span>
                  </div>
                  <ol className="space-y-2">
                    {guide.actionPlaybook.dailyRoutine.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Red Flags */}
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{t('redFlagsLabel')}</span>
                  </div>
                  <ul className="space-y-2">
                    {guide.actionPlaybook.redFlags.map((flag, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
                        <span className="font-bold text-amber-500 shrink-0">⚠️</span>
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recommended Actions */}
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                    <Target className="h-4 w-4 shrink-0" />
                    <span>{t('recommendedActionsLabel')}</span>
                  </div>
                  <ul className="space-y-2">
                    {guide.actionPlaybook.recommendedActions.map((action, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 leading-relaxed">
                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Action Footer */}
          <div className="border-t border-border/60 bg-muted/30 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleTriggerCopilot}
              data-testid="page-guide-ask-copilot-btn"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
            >
              <Bot className="h-4 w-4" />
              <span>{t('askCopilot')}</span>
              {isRtl ? (
                <ArrowLeft className="h-3 w-3 opacity-70" />
              ) : (
                <ArrowRight className="h-3 w-3 opacity-70" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto rounded-xl border border-border/80 bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              {t('close')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
