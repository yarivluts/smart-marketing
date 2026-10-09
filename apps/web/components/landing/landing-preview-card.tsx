'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Cpu,
  Layers,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';

export function LandingPreviewCard(): React.ReactElement {
  const [executed, setExecuted] = React.useState(false);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mb-20 sm:mb-24" id="product">
      <div className="bg-white rounded-3xl shadow-[0_8px_24px_-4px_rgba(112,100,244,0.09),0_24px_60px_-8px_rgba(112,100,244,0.16)] border border-pp-outline-variant/30 p-5 sm:p-7 lg:p-8 backdrop-blur-md relative overflow-hidden">
        {/* Window Chrome / Mac Dots & Live indicator */}
        <div className="flex flex-wrap items-center justify-between pb-5 border-b border-pp-surface-container-high gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff5f56]/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e]/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#27c93f]/80 inline-block" />
            <span className="ml-3 font-mono text-xs text-pp-on-surface-variant flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-pp-primary" aria-hidden />
              <span>growthos.production.telemetry/live-matrix</span>
            </span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pp-secondary-fixed/50 border border-pp-secondary/20 text-pp-on-secondary-fixed font-bold text-[11px] tracking-wider uppercase">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pp-secondary-container opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-pp-secondary" />
            </span>
            <span>● 18ms LIVE STREAM • 4 Channels Syncing</span>
          </div>
        </div>

        {/* 4 Top KPI Mini Cards with Soft Pastel Tints */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
          {/* KPI 1 */}
          <div className="bg-pp-surface-container-low/70 rounded-2xl p-4 sm:p-5 border border-pp-outline-variant/20 hover:border-pp-primary/30 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-[11px] text-pp-on-surface-variant uppercase tracking-wider">
                Blended ARR
              </span>
              <span className="px-2 py-0.5 rounded-full bg-pp-secondary-fixed/60 text-pp-secondary text-[11px] font-bold">
                +18.4% MoM
              </span>
            </div>
            <div className="font-pp-display text-2xl sm:text-3xl font-bold text-pp-on-surface">
              $4,820,000
            </div>
            <span className="text-xs text-pp-outline mt-1 block">Live Stripe &amp; Recurly sync</span>
          </div>

          {/* KPI 2 */}
          <div className="bg-pp-surface-container-low/70 rounded-2xl p-4 sm:p-5 border border-pp-outline-variant/20 hover:border-pp-primary/30 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-[11px] text-pp-on-surface-variant uppercase tracking-wider">
                Blended ROAS
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                vs 3.50x bench
              </span>
            </div>
            <div className="font-pp-display text-2xl sm:text-3xl font-bold text-pp-on-surface">
              4.12x
            </div>
            <span className="text-xs text-pp-outline mt-1 block">Markov 8-touch model</span>
          </div>

          {/* KPI 3 */}
          <div className="bg-pp-surface-container-low/70 rounded-2xl p-4 sm:p-5 border border-pp-outline-variant/20 hover:border-pp-primary/30 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-[11px] text-pp-on-surface-variant uppercase tracking-wider">
                CAC Payback
              </span>
              <span className="px-2 py-0.5 rounded-full bg-pp-primary-fixed text-pp-primary text-[11px] font-bold">
                Top 5% Decile
              </span>
            </div>
            <div className="font-pp-display text-2xl sm:text-3xl font-bold text-pp-on-surface">
              3.8 Mos
            </div>
            <span className="text-xs text-pp-outline mt-1 block">Cohort breakeven locked</span>
          </div>

          {/* KPI 4 */}
          <div className="bg-pp-surface-container-low/70 rounded-2xl p-4 sm:p-5 border border-pp-outline-variant/20 hover:border-pp-primary/30 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-[11px] text-pp-on-surface-variant uppercase tracking-wider">
                Net Retention
              </span>
              <span className="px-2 py-0.5 rounded-full bg-pp-tertiary-fixed text-pp-tertiary text-[11px] font-bold">
                GRR 96.2%
              </span>
            </div>
            <div className="font-pp-display text-2xl sm:text-3xl font-bold text-pp-on-surface">
              118%
            </div>
            <span className="text-xs text-pp-outline mt-1 block">Account expansion index</span>
          </div>
        </div>

        {/* Telemetry Main Split: Area Chart & Autonomous Copilot Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-stretch">
          {/* Chart Visual (Left 7 cols) */}
          <div className="lg:col-span-7 bg-white border border-pp-outline-variant/20 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
              <div>
                <h4 className="font-pp-display text-base sm:text-lg font-bold text-pp-on-surface">
                  Revenue Velocity &amp; Multi-Channel Spend
                </h4>
                <p className="text-xs text-pp-on-surface-variant">
                  Real-time dynamic ROAS pacing across Google, Meta Advantage+, &amp; TikTok UGC
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 font-semibold text-pp-on-surface-variant">
                  <span className="w-2.5 h-2.5 rounded-full bg-pp-primary inline-block" /> Meta
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-pp-on-surface-variant">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Google
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-pp-on-surface-variant">
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-400 inline-block" /> TikTok
                </span>
              </div>
            </div>

            {/* SVG Smooth Spline Chart */}
            <div className="relative w-full h-52 sm:h-56 pt-2">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 200">
                <defs>
                  <linearGradient id="primaryArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#5243d5" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#5243d5" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="mintArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#4bddb7" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#4bddb7" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Subtle grid lines */}
                <line stroke="#f0ebff" strokeWidth="1" x1="0" x2="600" y1="40" y2="40" />
                <line stroke="#f0ebff" strokeWidth="1" x1="0" x2="600" y1="90" y2="90" />
                <line stroke="#f0ebff" strokeWidth="1" x1="0" x2="600" y1="140" y2="140" />
                <line stroke="#f0ebff" strokeWidth="1" x1="0" x2="600" y1="190" y2="190" />
                {/* TikTok Line */}
                <path d="M0,160 Q100,150 200,140 T400,110 T600,80" fill="none" stroke="#a65b8e" strokeDasharray="4,4" strokeWidth="2" />
                {/* Google Line */}
                <path d="M0,140 Q150,110 300,120 T450,70 T600,50 L600,200 L0,200 Z" fill="url(#mintArea)" />
                <path d="M0,140 Q150,110 300,120 T450,70 T600,50" fill="none" stroke="#00b894" strokeWidth="2.5" />
                {/* Meta Line */}
                <path d="M0,120 Q120,90 240,110 T420,40 T600,20 L600,200 L0,200 Z" fill="url(#primaryArea)" />
                <path d="M0,120 Q120,90 240,110 T420,40 T600,20" fill="none" stroke="#5243d5" strokeWidth="3.5" />
                {/* Breakout Markers */}
                <circle cx="420" cy="40" fill="#5243d5" r="5" stroke="#ffffff" strokeWidth="2" />
                <circle cx="600" cy="20" fill="#00b894" r="6" stroke="#ffffff" strokeWidth="2" />
              </svg>
            </div>

            <div className="flex justify-between items-center text-pp-outline font-mono text-[11px] pt-3 border-t border-pp-surface-container">
              <span>00:00 UTC</span>
              <span>06:00 UTC</span>
              <span>12:00 UTC</span>
              <span>18:00 UTC</span>
              <span className="text-pp-primary font-bold">Now (+38.2% pacing)</span>
            </div>
          </div>

          {/* Active Autonomous Copilot Card (Right 5 cols) */}
          <div className="lg:col-span-5 bg-gradient-to-br from-white to-pp-surface-container-low border border-pp-primary/20 rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pp-primary text-white font-bold text-[10px] tracking-wider uppercase">
                  <Bot className="h-3.5 w-3.5" />
                  <span>AUTONOMOUS COPILOT</span>
                </span>
                <span className="text-[11px] font-bold text-pp-secondary flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-pp-secondary inline-block animate-pulse" />
                  <span>Active Agent #84</span>
                </span>
              </div>

              <div className="bg-white rounded-xl p-4 border border-pp-outline-variant/30 mb-4 shadow-xs">
                <p className="font-bold text-[11px] text-pp-outline uppercase tracking-wider mb-1">
                  Recommended Execution
                </p>
                <div className="font-pp-display text-base sm:text-lg font-bold text-pp-on-surface mb-1">
                  Shift $14,200 to Meta Advantage+
                </div>
                <p className="text-xs text-pp-on-surface-variant leading-relaxed">
                  Identified 2.8x higher conversion velocity on Creative V4 across European high-intent lookalike cohorts.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-pp-secondary-fixed/40 rounded-xl">
                  <span className="font-bold text-[11px] text-pp-secondary block">Projected ROAS</span>
                  <span className="font-pp-display text-xl font-bold text-pp-on-surface">+18.4%</span>
                </div>
                <div className="p-3 bg-pp-primary-fixed/50 rounded-xl">
                  <span className="font-bold text-[11px] text-pp-primary block">CPA Reduction</span>
                  <span className="font-pp-display text-xl font-bold text-pp-on-surface">-$23.40</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setExecuted(!executed)}
                className={`w-full font-semibold text-sm py-3.5 rounded-full flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] ${
                  executed
                    ? 'bg-pp-secondary text-white'
                    : 'bg-pp-primary hover:bg-pp-primary-container text-white'
                }`}
              >
                {executed ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Loop Executed (Rebalanced)</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    <span>Auto-Execute Action Loop</span>
                  </>
                )}
              </button>
              <p className="text-center text-[11px] text-pp-outline mt-2">
                MCP Agent authenticated with Cursor &amp; Claude 3.7
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
