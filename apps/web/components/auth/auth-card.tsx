'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Sparkles, ShieldCheck, Lock, CheckCircle2, TrendingUp, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PpIconChip, PpPill } from '@/components/pastel/primitives';

export interface AuthCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showBrandingSide?: boolean;
  className?: string;
}

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  showBrandingSide = true,
  className,
}: AuthCardProps): React.ReactElement {
  const locale = useLocale();
  const isRtl = locale === 'he';
  const t = useTranslations('Auth');

  const featureHighlights = [
    {
      title: locale === 'he' ? 'אוטומציית שיווק ב-AI' : 'Autonomous AI Marketing',
      desc: locale === 'he' ? 'ניהול והקצאת תקציבים בזמן אמת ב-Meta ו-Google' : 'Real-time budget & bid optimization across Meta & Google',
    },
    {
      title: locale === 'he' ? 'בקרת שינויים ו-Rollback' : '1-Click Safe Rollbacks',
      desc: locale === 'he' ? 'גבולות גזרה מחמירים וביטול שינויים בלחיצה אחת' : 'Strict guardrails and instant 1-click execution reversibility',
    },
    {
      title: locale === 'he' ? 'דוחות משפך ו-Cohorts' : 'Deep Funnel & Cohort Retention',
      desc: locale === 'he' ? 'מדידת CAC, ROAS ושיעורי נטישה מדויקים' : 'Multi-touch CAC, blended ROAS, and cohort payback metrics',
    },
  ];

  return (
    <div
      data-testid="auth-card-container"
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-screen bg-pp-surface-container-low text-pp-on-surface antialiased flex flex-col justify-between selection:bg-pp-primary-fixed selection:text-pp-on-primary-fixed relative overflow-x-hidden"
    >
      {/* Ambient Pastel Glows */}
      <div className="absolute -top-24 -start-24 w-96 h-96 bg-pp-primary-fixed rounded-full blur-3xl opacity-40 pointer-events-none" />
      <div className="absolute top-1/2 -end-24 w-96 h-96 bg-pp-secondary-fixed rounded-full blur-3xl opacity-25 pointer-events-none" />

      {/* Top App Bar */}
      <header className="w-full bg-transparent z-10">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-pp-primary flex items-center justify-center text-pp-on-primary shadow-pp-candy">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-on-surface">GrowthOS</span>
              <span className="text-[11px] font-semibold text-pp-on-surface-variant uppercase tracking-wider">Enterprise</span>
            </div>
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 bg-pp-surface-container rounded-full ms-2">
              <span className="h-1.5 w-1.5 rounded-full bg-pp-primary" />
              <span className="text-pp-label-sm text-pp-on-surface-variant font-medium">
                {locale === 'he' ? 'מנוע צמיחה אוטונומי' : 'Autonomous Marketing Engine'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pp-secondary-container/40 text-pp-on-secondary-container text-pp-label-sm font-bold">
              <span className="h-2 w-2 rounded-full bg-pp-secondary animate-pulse" />
              <span>{t('soc2Verified')}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Stage (Split View) */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-10 flex-grow flex items-center z-10">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Pastel Telemetry & Brand Showcase (Desktop) */}
          {showBrandingSide ? (
            <div className="hidden lg:flex lg:col-span-6 flex-col gap-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pp-primary-fixed text-pp-on-primary-fixed-variant text-pp-label-sm font-bold mb-4">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{t('enterpriseBadge')}</span>
                </div>
                <h1 className="font-pp-display text-pp-headline-xl text-pp-on-surface tracking-tight leading-tight">
                  {t('heroTitle')}
                </h1>
                <p className="text-pp-body-lg text-pp-on-surface-variant mt-3 max-w-lg">
                  {t('heroSubtitle')}
                </p>
              </div>

              {/* 4-Quadrant Pastel Grid */}
              <div className="grid grid-cols-2 gap-3.5">
                {/* Card 1: Lavender / Primary */}
                <div className="bg-pp-primary p-5 rounded-2xl text-pp-on-primary shadow-pp-candy flex flex-col justify-between h-28 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-pp-label-sm uppercase tracking-wider text-pp-on-primary/80 font-semibold">
                      {featureHighlights[0].title}
                    </span>
                    <Activity className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-pp-display text-pp-headline-lg text-pp-on-primary">15 Live</p>
                    <p className="text-pp-body-sm text-pp-on-primary/80">Zero ingestion drift</p>
                  </div>
                </div>

                {/* Card 2: Amber */}
                <div className="bg-[#FFF1C2] p-5 rounded-2xl text-[#684805] shadow-pp-candy flex flex-col justify-between h-28 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-pp-label-sm uppercase tracking-wider text-[#684805]/90 font-semibold">
                      {t('adSetsActive')}
                    </span>
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-pp-display text-pp-headline-lg text-[#684805]">12 Tracks</p>
                    <p className="text-pp-body-sm text-[#684805]/80">Meta, Google & TikTok</p>
                  </div>
                </div>

                {/* Card 3: Rose / Pink */}
                <div className="bg-[#FFE5F1] p-5 rounded-2xl text-[#781B57] shadow-pp-candy flex flex-col justify-between h-28 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-pp-label-sm uppercase tracking-wider text-[#781B57]/90 font-semibold">
                      {t('slaUptime')}
                    </span>
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-pp-display text-pp-headline-lg text-[#781B57]">99.98%</p>
                    <p className="text-pp-body-sm text-[#781B57]/80">ISO-27001 audited</p>
                  </div>
                </div>

                {/* Card 4: Mint */}
                <div className="bg-pp-secondary-container p-5 rounded-2xl text-pp-on-secondary-container shadow-pp-candy flex flex-col justify-between h-28 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-pp-label-sm uppercase tracking-wider text-pp-on-secondary-container/90 font-semibold">
                      {t('blendedPayback')}
                    </span>
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-pp-display text-pp-headline-lg text-pp-on-secondary-container">3.8 mo</p>
                    <p className="text-pp-body-sm text-pp-on-secondary-container/80">-14% acquisition cost</p>
                  </div>
                </div>
              </div>

              {/* Telemetry Highlights (ROAS curve & Live Ingestion) */}
              <div className="bg-pp-surface-container-lowest p-6 rounded-2xl shadow-pp-candy flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-on-secondary-fixed">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-pp-label-sm uppercase text-pp-outline font-semibold">{t('roasTelemetry')}</p>
                      <p className="font-pp-display text-pp-headline-md text-pp-on-surface">
                        4.20x <span className="text-pp-body-sm text-pp-secondary font-bold">(+38% vs target)</span>
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-pp-secondary-fixed/50 text-pp-on-secondary-fixed text-pp-label-sm font-semibold">
                    Live Feed
                  </span>
                </div>

                <div className="w-full h-12 relative flex items-end">
                  <svg className="w-full h-full overflow-visible" fill="none" preserveAspectRatio="none" viewBox="0 0 400 60">
                    <path d="M0 45 C 50 40, 80 50, 130 30 C 180 10, 220 38, 270 20 C 320 5, 360 25, 400 12" stroke="#5243d5" strokeLinecap="round" strokeWidth="3" />
                    <path d="M0 52 C 60 50, 100 42, 160 40 C 220 38, 260 48, 320 32 C 360 22, 380 28, 400 24" stroke="#63fbcf" strokeLinecap="round" strokeWidth="2.5" />
                  </svg>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-pp-surface-container text-pp-body-sm text-pp-on-surface-variant">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-pp-secondary animate-ping" />
                    <span>18ms Ingestion Latency</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-pp-surface-container text-pp-on-surface-variant text-pp-label-sm font-semibold">Stripe</span>
                    <span className="px-2 py-0.5 rounded bg-pp-surface-container text-pp-on-surface-variant text-pp-label-sm font-semibold">Meta CAPI</span>
                    <span className="px-2 py-0.5 rounded bg-pp-surface-container text-pp-on-surface-variant text-pp-label-sm font-semibold">Google Ads</span>
                  </div>
                </div>
              </div>

              {/* Security Trust Row */}
              <div className="flex items-center justify-between pt-2 text-pp-body-sm text-pp-on-surface-variant border-t border-pp-surface-container">
                <div className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-pp-secondary" />
                  <span className="font-semibold text-pp-on-surface">256-bit SSL Encrypted</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-pp-primary" />
                  <span className="font-semibold text-pp-on-surface">SOC2 Compliant</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-pp-secondary" />
                  <span className="font-semibold text-pp-on-surface">{featureHighlights[1].title}</span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Right Column: High-Polish Frosted Glass Auth Card */}
          <div className={cn('w-full flex justify-center', showBrandingSide ? 'lg:col-span-6' : 'lg:col-span-12')}>
            <div className={cn(
              'w-full max-w-lg bg-pp-surface-container-lowest/95 backdrop-blur-xl rounded-3xl p-6 sm:p-9 shadow-pp-candy border border-white/60 relative',
              className,
            )}>
              {/* Optional Title & Subtitle */}
              {title ? (
                <h1 className="font-pp-display text-pp-headline-xl-mobile md:text-pp-headline-xl font-bold tracking-tight text-pp-on-surface mb-2">
                  {title}
                </h1>
              ) : null}
              {subtitle ? (
                <p className="text-pp-body-md text-pp-on-surface-variant mb-6">
                  {subtitle}
                </p>
              ) : null}

              {/* Form Content */}
              <div className="w-full">
                {children}
              </div>

              {/* Optional Footer */}
              {footer ? (
                <div className="mt-8 border-t border-pp-surface-container pt-6 text-center text-pp-body-sm text-pp-outline">
                  {footer}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-transparent z-10">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4 text-pp-body-sm text-pp-outline border-t border-pp-surface-container/60">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pp-secondary" />
            <p>
              © 2026 GrowthOS Inc. All rights reserved. {t('soc2Verified')}.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <span className="hover:text-pp-on-surface transition-colors">Privacy Policy</span>
            <span className="hover:text-pp-on-surface transition-colors">Terms of Service</span>
            <span className="hover:text-pp-on-surface transition-colors">Security Compliance</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
