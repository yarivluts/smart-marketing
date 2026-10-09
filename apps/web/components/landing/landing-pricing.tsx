'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';

export function LandingPricing(): React.ReactElement {
  const [billing, setBilling] = React.useState<'monthly' | 'annual'>('annual');

  const prices = {
    starter: billing === 'annual' ? 232 : 290,
    scale: billing === 'annual' ? 632 : 790,
    enterprise: billing === 'annual' ? 1560 : 1950,
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mb-24 sm:mb-28" id="pricing">
      <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-14">
        <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-pp-surface-container-low border border-pp-primary/20 text-pp-primary font-mono text-[11px] font-bold tracking-wider uppercase mb-4">
          TRANSPARENT PRICING
        </div>
        <h2 className="font-pp-display text-3xl sm:text-4xl lg:text-5xl font-bold text-pp-on-surface tracking-tight mb-4">
          Predictable pricing that pays for itself in 7 days
        </h2>
        <p className="font-pp-body text-base sm:text-lg text-pp-on-surface-variant mb-8 leading-relaxed">
          Every tier includes unlimited tracked revenue, server-side data pipeline, and zero hidden platform tax.
        </p>

        {/* Interactive Billing Toggle Switch */}
        <div className="inline-flex items-center p-1.5 bg-pp-surface-container rounded-full border border-pp-outline-variant/30 shadow-inner">
          <button
            type="button"
            onClick={() => setBilling('monthly')}
            className={`px-5 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 ${
              billing === 'monthly'
                ? 'bg-white text-pp-primary font-bold shadow-sm'
                : 'text-pp-on-surface-variant hover:text-pp-on-surface'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling('annual')}
            className={`px-5 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all duration-200 ${
              billing === 'annual'
                ? 'bg-white text-pp-primary font-bold shadow-sm'
                : 'text-pp-on-surface-variant hover:text-pp-on-surface'
            }`}
          >
            <span>Annual</span>
            <span className="px-2 py-0.5 rounded-full bg-pp-secondary-fixed text-pp-on-secondary-fixed font-bold text-[10px] tracking-wider uppercase">
              Save 20% + 2 Mos Free
            </span>
          </button>
        </div>
      </div>

      {/* 3 Pricing Tier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-stretch">
        {/* Starter Tier */}
        <div className="bg-white rounded-3xl p-7 sm:p-10 border border-pp-outline-variant/30 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="font-mono text-xs font-bold text-pp-outline uppercase tracking-wider">
                Starter
              </span>
              <span className="px-3 py-1 rounded-full bg-pp-surface-container-low font-bold text-[11px] text-pp-on-surface-variant">
                Fast Setup
              </span>
            </div>
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="font-pp-display text-4xl sm:text-5xl font-bold text-pp-on-surface">
                  ${prices.starter}
                </span>
                <span className="text-sm text-pp-outline">/mo</span>
              </div>
              <span className="text-xs text-pp-outline mt-1 block">
                {billing === 'annual' ? 'Billed annually ($2,784/yr)' : 'Billed monthly, cancel anytime'}
              </span>
            </div>
            <p className="text-sm text-pp-on-surface-variant pb-6 mb-6 border-b border-pp-surface-container">
              Ideal for growing DTC &amp; B2B startups seeking foundational attribution accuracy.
            </p>
            <ul className="space-y-3.5 text-xs sm:text-sm text-pp-on-surface mb-8">
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span><strong>1,000,000</strong> events/month</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>Google &amp; Meta automated sync</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>Standard 12-month cohort analysis</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>3 Included team seats</span>
              </li>
              <li className="flex items-center gap-3 text-pp-outline opacity-60">
                <span className="w-5 h-5 rounded-full bg-pp-surface-container flex items-center justify-center text-pp-outline shrink-0">
                  <X className="h-3.5 w-3.5" />
                </span>
                <span>Model Context Protocol (MCP)</span>
              </li>
            </ul>
          </div>
          <Link
            href="/signup"
            className="w-full text-center py-3.5 rounded-full border border-pp-outline-variant hover:border-pp-primary text-pp-on-surface hover:text-pp-primary font-semibold text-sm transition-colors bg-white shadow-xs"
          >
            Get Started
          </Link>
        </div>

        {/* Scale & Copilot (FEATURED & MOST POPULAR) */}
        <div className="bg-white rounded-3xl p-7 sm:p-10 border-2 border-pp-primary shadow-[0_8px_24px_-4px_rgba(112,100,244,0.16),0_20px_48px_-8px_rgba(112,100,244,0.22)] relative flex flex-col justify-between scale-100 lg:scale-105 z-10">
          {/* Absolute Badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-amber-100 text-amber-900 font-mono text-[10px] uppercase tracking-wider font-extrabold shadow-sm border border-amber-300">
            ★ MOST POPULAR &amp; COPILOT READY
          </div>
          <div>
            <div className="flex justify-between items-center mb-4 mt-2">
              <span className="font-mono text-xs font-bold text-pp-primary uppercase tracking-wider">
                Scale &amp; Copilot
              </span>
              <span className="px-3 py-1 rounded-full bg-pp-secondary-fixed text-pp-on-secondary-fixed font-bold text-[11px]">
                Recommended
              </span>
            </div>
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="font-pp-display text-4xl sm:text-5xl font-bold text-pp-primary">
                  ${prices.scale}
                </span>
                <span className="text-sm text-pp-outline">/mo</span>
              </div>
              <span className="text-xs text-pp-outline mt-1 block">
                {billing === 'annual' ? 'Billed annually ($7,584/yr)' : 'Billed monthly, cancel anytime'}
              </span>
            </div>
            <p className="text-sm text-pp-on-surface-variant pb-6 mb-6 border-b border-pp-surface-container">
              Autonomous ad optimization, multi-touch algorithms, and full Cursor/Claude agent connectivity.
            </p>
            <ul className="space-y-3.5 text-xs sm:text-sm text-pp-on-surface mb-8">
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span><strong>10,000,000</strong> events/month</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span><strong>All 26 MCP streaming analytical tools</strong></span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>Autonomous Copilot budget optimization</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>Full 8-model multi-touch attribution</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>Real-time Slack &amp; Webhook alerting</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>15 Included team seats</span>
              </li>
            </ul>
          </div>
          <Link
            href="/signup"
            className="w-full text-center py-4 rounded-full bg-pp-primary hover:bg-pp-primary-container text-white font-semibold text-sm shadow-[0_8px_20px_-4px_rgba(112,100,244,0.4)] hover:scale-[1.01] active:scale-[0.98] transition-all"
          >
            Claim Scale &amp; Copilot Trial
          </Link>
        </div>

        {/* Enterprise Tier */}
        <div className="bg-white rounded-3xl p-7 sm:p-10 border border-pp-outline-variant/30 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="font-mono text-xs font-bold text-pp-outline uppercase tracking-wider">
                Enterprise
              </span>
              <span className="px-3 py-1 rounded-full bg-pp-surface-container-high font-bold text-[11px] text-pp-on-surface">
                Custom SLAs
              </span>
            </div>
            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="font-pp-display text-4xl sm:text-5xl font-bold text-pp-on-surface">
                  ${prices.enterprise}
                </span>
                <span className="text-sm text-pp-outline">/mo</span>
              </div>
              <span className="text-xs text-pp-outline mt-1 block">
                {billing === 'annual' ? 'Billed annually ($18,720/yr)' : 'Billed monthly, custom invoicing'}
              </span>
            </div>
            <p className="text-sm text-pp-on-surface-variant pb-6 mb-6 border-b border-pp-surface-container">
              Tailored high-volume streaming, direct data warehouse pipelines, and dedicated infrastructure.
            </p>
            <ul className="space-y-3.5 text-xs sm:text-sm text-pp-on-surface mb-8">
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span><strong>Unlimited</strong> event telemetry pipeline</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>Snowflake &amp; BigQuery warehouse direct</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>Custom agent loops &amp; bespoke safety triggers</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>Unlimited seats &amp; granular IAM permissions</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-pp-secondary-fixed flex items-center justify-center text-pp-secondary shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>24/7 Dedicated data engineer &amp; 99.99% SLA</span>
              </li>
            </ul>
          </div>
          <Link
            href="/contact"
            className="w-full text-center py-3.5 rounded-full border border-pp-outline-variant hover:border-pp-primary text-pp-on-surface hover:text-pp-primary font-semibold text-sm transition-colors bg-white shadow-xs"
          >
            Contact Sales &amp; Solution Arch
          </Link>
        </div>
      </div>

      {/* Guarantee Note */}
      <div className="mt-12 text-center text-pp-outline text-xs sm:text-sm flex items-center justify-center gap-2">
        <ShieldCheck className="h-4 w-4 text-pp-secondary" />
        <span>14-day zero-risk trial on all plans • No credit card required to connect sandbox data</span>
      </div>
    </section>
  );
}
