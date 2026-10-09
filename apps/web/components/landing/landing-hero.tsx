'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Sparkles, Terminal, Star, ArrowRight } from 'lucide-react';

export function LandingHero(): React.ReactElement {
  const t = useTranslations('HomePage');

  return (
    <section className="relative z-10 pt-28 sm:pt-36 pb-12 sm:pb-16 text-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-10" data-testid="landing-hero">
      {/* Eyebrow Pill */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-pp-surface-container/70 border border-pp-primary/20 text-pp-primary mb-8 shadow-sm backdrop-blur-sm">
        <span className="flex h-2 w-2 rounded-full bg-pp-secondary-container animate-pulse" />
        <span className="font-semibold text-xs sm:text-sm">
          ✨ GrowthOS 3.0 Live • Autonomous Multi-Agent Marketing Engine
        </span>
      </div>

      {/* Grand Title */}
      <h1 className="font-pp-display text-4xl sm:text-5xl md:text-6xl lg:text-[64px] lg:leading-[72px] font-extrabold max-w-5xl mx-auto text-pp-on-surface mb-6 tracking-tight">
        The Autonomous Growth Telemetry &amp; Performance Operating System
      </h1>

      {/* Crisp Subtitle */}
      <p className="font-pp-body text-base sm:text-lg md:text-xl text-pp-on-surface-variant max-w-3xl mx-auto mb-10 leading-relaxed">
        Replace fragmented dashboards with unified ad attribution, real-time cohort breakeven pacing, and autonomous AI budget optimization.
      </p>

      {/* Dual Call to Actions */}
      <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
        <a
          href="#product"
          className="bg-pp-primary hover:bg-pp-primary-container text-white font-semibold text-sm sm:text-base px-7 sm:px-8 py-3.5 sm:py-4 rounded-full shadow-[0_8px_20px_-4px_rgba(112,100,244,0.35)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <Sparkles className="h-5 w-5" aria-hidden />
          <span>Launch Live Demo</span>
        </a>
        <Link
          href="/dashboard"
          className="bg-white hover:bg-pp-surface-container text-pp-on-surface font-semibold text-sm sm:text-base px-6 sm:px-7 py-3.5 sm:py-4 rounded-full border border-pp-outline-variant/50 hover:border-pp-primary/40 shadow-sm transition-all flex items-center gap-2"
        >
          <span>Explore MCP Analytics</span>
          <Terminal className="h-4 w-4 text-pp-primary" aria-hidden />
        </Link>
      </div>

      {/* Social Proof Sub-ticker */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <div className="flex -space-x-2 overflow-hidden">
          <div className="inline-flex h-8 w-8 rounded-full ring-2 ring-white bg-pp-surface-container-high items-center justify-center text-xs font-bold text-pp-primary">
            SC
          </div>
          <div className="inline-flex h-8 w-8 rounded-full ring-2 ring-white bg-pp-secondary-fixed items-center justify-center text-xs font-bold text-pp-on-secondary-fixed">
            MR
          </div>
          <div className="inline-flex h-8 w-8 rounded-full ring-2 ring-white bg-pp-tertiary-fixed items-center justify-center text-xs font-bold text-pp-on-tertiary-fixed">
            NX
          </div>
          <div className="inline-flex h-8 w-8 rounded-full ring-2 ring-white bg-pp-primary-fixed items-center justify-center text-xs font-bold text-pp-primary">
            8+
          </div>
        </div>
        <div className="flex items-center gap-0.5 text-amber-400">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
        </div>
        <span className="text-xs sm:text-sm text-pp-on-surface-variant font-medium">
          Trusted by <strong className="text-pp-on-surface">450+ scale-ups</strong> analyzing $120M+ annualized ad spend
        </span>
      </div>
    </section>
  );
}
