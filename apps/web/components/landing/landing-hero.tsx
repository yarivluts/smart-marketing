'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Bot,
  Play,
  TrendingUp,
  Zap,
} from 'lucide-react';

export function LandingHero(): React.ReactElement {
  const t = useTranslations('HomePage');
  const [activeVertical, setActiveVertical] = useState<'saas' | 'ecom' | 'agency'>('saas');

  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28" data-testid="landing-hero">
      {/* Background Glow Decorations */}
      <div className="absolute top-1/2 left-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 h-[550px] w-[850px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute top-1/4 -left-40 -z-10 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 -z-10 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          {/* Eyebrow Pill */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs sm:text-sm font-semibold text-primary shadow-soft backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span>{t('heroEyebrow')}</span>
          </div>

          {/* Interactive Floating Micro-Badges Bar */}
          <div className="mb-6 hidden sm:flex items-center justify-center gap-4 flex-wrap">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shadow-xs hover:scale-105 transition-transform cursor-default">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>3.84x Blended ROAS</span>
              <span className="text-[10px] opacity-80" dir="ltr">(+28% YoY)</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-600 dark:text-purple-400 shadow-xs hover:scale-105 transition-transform cursor-default">
              <Bot className="h-3.5 w-3.5" />
              <span>Autonomous Guardrails Active</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 shadow-xs hover:scale-105 transition-transform cursor-default">
              <Zap className="h-3.5 w-3.5" />
              <span dir="ltr">&lt;18ms Edge Ingestion</span>
            </div>
          </div>

          {/* Main Headline */}
          <h1 className="max-w-4xl text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15]">
            <span className="bg-gradient-to-br from-foreground via-foreground to-foreground/75 bg-clip-text text-transparent">
              {t('heroHeadline')}
            </span>
          </h1>

          {/* Value Subtext */}
          <p className="mt-6 max-w-2xl text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed">
            {t('heroDescription')}
          </p>

          {/* Interactive Vertical Persona Selector */}
          <div className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card/60 p-1 backdrop-blur-sm text-xs">
            <button
              type="button"
              onClick={() => setActiveVertical('saas')}
              className={`rounded-lg px-3 py-1.5 font-bold transition-all ${
                activeVertical === 'saas'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              🚀 B2B SaaS
            </button>
            <button
              type="button"
              onClick={() => setActiveVertical('ecom')}
              className={`rounded-lg px-3 py-1.5 font-bold transition-all ${
                activeVertical === 'ecom'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              🛍️ E-Commerce
            </button>
            <button
              type="button"
              onClick={() => setActiveVertical('agency')}
              className={`rounded-lg px-3 py-1.5 font-bold transition-all ${
                activeVertical === 'agency'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📈 Media Agencies
            </button>
          </div>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Button asChild size="lg" className="w-full sm:w-auto bg-brand-gradient text-white shadow-soft-lg hover:opacity-95 text-base px-8 h-12">
              <Link href="/dashboard" className="flex items-center justify-center gap-2">
                <span>{t('startTrial')}</span>
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto bg-background/60 backdrop-blur-sm text-base px-6 h-12 border-border/80 hover:bg-muted/50">
              <a href="#calculator" className="flex items-center justify-center gap-2">
                <Play className="h-4 w-4 text-primary fill-primary/20" />
                <span>Calculate Your ROI</span>
              </a>
            </Button>
          </div>

          {/* Social Proof Stats Ribbon */}
          <div className="mt-16 w-full max-w-5xl rounded-2xl border border-border/60 bg-card/60 p-6 sm:p-8 backdrop-blur-md shadow-soft-md">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 divide-y lg:divide-y-0 lg:divide-x divide-border/40 rtl:lg:divide-x-reverse">
              {/* Stat 1 */}
              <div className="flex flex-col items-center text-center pt-4 lg:pt-0 hover:scale-105 transition-transform duration-200">
                <div className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                  <span dir="ltr">{t('statAdSpend')}</span>
                </div>
                <div className="mt-1.5 text-xs sm:text-sm font-medium text-muted-foreground">
                  {t('statAdSpendLabel')}
                </div>
              </div>

              {/* Stat 2 */}
              <div className="flex flex-col items-center text-center pt-4 lg:pt-0 hover:scale-105 transition-transform duration-200">
                <div className="text-3xl sm:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
                  <span dir="ltr">{t('statUptime')}</span>
                </div>
                <div className="mt-1.5 text-xs sm:text-sm font-medium text-muted-foreground">
                  {t('statUptimeLabel')}
                </div>
              </div>

              {/* Stat 3 */}
              <div className="flex flex-col items-center text-center pt-4 lg:pt-0 hover:scale-105 transition-transform duration-200">
                <div className="text-3xl sm:text-4xl font-extrabold text-primary tracking-tight">
                  <span dir="ltr">{t('statLatency')}</span>
                </div>
                <div className="mt-1.5 text-xs sm:text-sm font-medium text-muted-foreground">
                  {t('statLatencyLabel')}
                </div>
              </div>

              {/* Stat 4 */}
              <div className="flex flex-col items-center text-center pt-4 lg:pt-0 hover:scale-105 transition-transform duration-200">
                <div className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
                  <span dir="ltr">{t('statConnectors')}</span>
                </div>
                <div className="mt-1.5 text-xs sm:text-sm font-medium text-muted-foreground">
                  {t('statConnectorsLabel')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
