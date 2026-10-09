'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, Check, Layers, Terminal } from 'lucide-react';

export function LandingPillars(): React.ReactElement {
  const t = useTranslations('HomePage');

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mb-24 sm:mb-28" id="features">
      <div className="text-center max-w-3xl mx-auto mb-14 sm:mb-16">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-pp-surface-container text-pp-primary font-mono text-[11px] font-bold tracking-wider uppercase mb-3">
          INSTRUMENTATION ARCHITECTURE
        </div>
        <h2 className="font-pp-display text-3xl sm:text-4xl lg:text-[44px] font-bold text-pp-on-surface tracking-tight mb-4">
          Engineered for Mathematical Truth Across Every Touchpoint
        </h2>
        <p className="font-pp-body text-base sm:text-lg text-pp-on-surface-variant leading-relaxed">
          Ditch vague analytics estimates. GrowthOS combines server-side event streaming with multi-agent intelligence to expose absolute revenue clarity.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
        {/* Pillar 1 */}
        <div className="bg-white rounded-3xl p-7 sm:p-8 shadow-sm border border-pp-outline-variant/30 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-pp-tertiary-fixed/60 flex items-center justify-center text-pp-tertiary mb-6">
              <Layers className="h-6 w-6" />
            </div>
            <div className="inline-block px-3 py-1 rounded-full bg-pp-tertiary-fixed text-pp-on-tertiary-fixed font-bold text-[11px] uppercase tracking-wider mb-3">
              Deep Multi-Touch Attribution
            </div>
            <h3 className="font-pp-display text-xl font-bold text-pp-on-surface mb-3">
              8 Deterministic &amp; Algorithmic Models
            </h3>
            <p className="text-sm text-pp-on-surface-variant mb-6 leading-relaxed">
              Cookieless first-party server-side tracking captures real purchase journeys across devices with instant CPA &amp; ROAS variance alerts.
            </p>
          </div>
          <ul className="space-y-2.5 pt-4 border-t border-pp-surface-container-high text-xs sm:text-sm text-pp-on-surface">
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>First-party edge tracking pixel</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>Shapley &amp; Markov chain modeling</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>Full iOS 14.5+ recovery rates</span>
            </li>
          </ul>
        </div>

        {/* Pillar 2 */}
        <div className="bg-white rounded-3xl p-7 sm:p-8 shadow-sm border border-pp-outline-variant/30 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-pp-secondary-fixed/50 flex items-center justify-center text-pp-secondary mb-6">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div className="inline-block px-3 py-1 rounded-full bg-pp-secondary-fixed text-pp-on-secondary-fixed font-bold text-[11px] uppercase tracking-wider mb-3">
              12-24 Mo Cohort Breakeven
            </div>
            <h3 className="font-pp-display text-xl font-bold text-pp-on-surface mb-3">
              Exact Customer Payback Day Calculation
            </h3>
            <p className="text-sm text-pp-on-surface-variant mb-6 leading-relaxed">
              Track churn velocity and predictive LTV curves month-by-month. Know the exact day each cohort turns pure profit.
            </p>
          </div>
          <ul className="space-y-2.5 pt-4 border-t border-pp-surface-container-high text-xs sm:text-sm text-pp-on-surface">
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>Cohort-level payback schedules</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>Predictive churn risk triggers</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>Gross Margin adjusted LTV</span>
            </li>
          </ul>
        </div>

        {/* Pillar 3 */}
        <div className="bg-white rounded-3xl p-7 sm:p-8 shadow-sm border border-pp-outline-variant/30 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-pp-primary-fixed flex items-center justify-center text-pp-primary mb-6">
              <Terminal className="h-6 w-6" />
            </div>
            <div className="inline-block px-3 py-1 rounded-full bg-pp-primary-fixed text-pp-primary font-bold text-[11px] uppercase tracking-wider mb-3">
              Model Context Protocol (MCP)
            </div>
            <h3 className="font-pp-display text-xl font-bold text-pp-on-surface mb-3">
              Direct AI Agent Analytical Connectivity
            </h3>
            <p className="text-sm text-pp-on-surface-variant mb-6 leading-relaxed">
              Expose 26 streaming telemetry tools directly to Cursor, Claude Desktop, and LangChain autonomous marketing agents.
            </p>
          </div>
          <ul className="space-y-2.5 pt-4 border-t border-pp-surface-container-high text-xs sm:text-sm text-pp-on-surface">
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>26 native MCP analytical tools</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>Autonomous ad spend guardrails</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>One-click Claude Desktop config</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
