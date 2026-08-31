'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { Sparkles, ShieldCheck, Zap, Lock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      className="flex min-h-[calc(100vh-80px)] w-full items-center justify-center p-4 sm:p-8"
    >
      <div className="grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-3xl border border-border/80 bg-card shadow-soft-xl lg:grid-cols-12">
        {/* Left/Main Column: Auth Form Card */}
        <div className={cn('flex flex-col justify-between p-8 sm:p-12', showBrandingSide ? 'lg:col-span-7' : 'lg:col-span-12', className)}>
          <div>
            {/* Logo Badge */}
            <div className="flex items-center gap-2.5 mb-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg tracking-tight text-foreground">GrowthOS</span>
                <span className="text-[11px] font-medium text-muted-foreground">Autonomous Marketing Engine</span>
              </div>
            </div>

            {title && (
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-2">
                {title}
              </h1>
            )}

            {subtitle && (
              <p className="text-sm text-muted-foreground mb-6">
                {subtitle}
              </p>
            )}

            {/* Form Content */}
            <div className="w-full">
              {children}
            </div>
          </div>

          {footer && (
            <div className="mt-8 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
              {footer}
            </div>
          )}
        </div>

        {/* Right Column: Branded Highlights Side */}
        {showBrandingSide && (
          <div className="hidden lg:flex lg:col-span-5 flex-col justify-between border-s border-border/60 bg-gradient-to-br from-indigo-950/20 via-primary/5 to-emerald-950/20 p-10 text-foreground">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-6">
                <Zap className="h-3.5 w-3.5" />
                <span>Enterprise Growth Suite</span>
              </div>

              <h2 className="text-xl font-bold tracking-tight text-foreground mb-3">
                {locale === 'he'
                  ? 'הפלטפורמה האוטונומית לצמיחה עסקית'
                  : 'The Autonomous Growth Platform for Scaled Marketing'}
              </h2>

              <p className="text-xs text-muted-foreground leading-relaxed mb-8">
                {locale === 'he'
                  ? 'חבר את ערוצי הפרסום שלך ותן ל-AI לנתח, להציע ולבצע פעולות אופטימיזציה עם שקיפות מלאה.'
                  : 'Connect your marketing channels and let AI analyze, propose, and execute budget optimizations with full transparency and safety.'}
              </p>

              <div className="space-y-4">
                {featureHighlights.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-3 rounded-xl bg-card/60 border border-border/40 p-3 shadow-xs">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mt-0.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">{feature.title}</h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>256-bit SSL Encrypted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>SOC2 Compliant</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
