'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Zap,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Layers,
} from 'lucide-react';
import { PpCard } from '@/components/pastel/primitives';

export function PricingMtuCalculator() {
  const [mtu, setMtu] = useState<number>(150000);
  const [annualBilling, setAnnualBilling] = useState<boolean>(true);

  // Dynamic pricing calculation based on MTU
  const getTier = (val: number) => {
    if (val <= 100000) {
      return {
        name: 'Free Sandbox',
        priceMonthly: 0,
        priceAnnual: 0,
        features: [
          'Up to 100,000 MTUs / month free',
          'Visual DOM Editor & Prompt-to-DOM Studio',
          'Native GA4 & Meta CAPI Event Sync',
          'Standard Frequentist & Bayesian Stats',
          'Single Domain Verification',
        ],
      };
    }
    if (val <= 500000) {
      return {
        name: 'Growth Scale',
        priceMonthly: 299,
        priceAnnual: 224, // 25% discount
        features: [
          'Up to 500,000 MTUs / month',
          'Automated Cost Guardrails & Kill Switch',
          'Multi-Touch Attribution (Shapley & Markov)',
          'AI Copilot Proactive Recommendations',
          'Sub-20ms Edge Script Execution',
          'Unlimited Team Members & RBAC',
        ],
      };
    }
    return {
      name: 'Enterprise Unlimited',
      priceMonthly: 799,
      priceAnnual: 599,
      features: [
        'Millions of MTUs with Tiered Volume Discounts',
        'Dedicated Private VPC & SOC2 Type II Certified',
        'Custom Warehouse Mart Sync (BigQuery / Snowflake)',
        'Custom Attribution Weighting & Offline CRM Feeds',
        '24/7 Dedicated Slack Channel & Executive SLA',
      ],
    };
  };

  const currentTier = getTier(mtu);
  const baseIncluded = 100000;
  const overageUsers = Math.max(0, mtu - baseIncluded);
  const overageFee = overageUsers * 0.0012;
  const effectiveCost = annualBilling ? currentTier.priceAnnual : currentTier.priceMonthly;
  const costPerMtu = (effectiveCost / mtu).toFixed(5);
  const formattedVolume = mtu >= 1000000 ? `${(mtu / 1000000).toFixed(1)}M` : `${Math.round(mtu / 1000)}k`;

  return (
    <div className="space-y-12 py-6 font-pp-body text-pp-on-surface" data-testid="pricing-mtu-calculator">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pp-secondary-container/30 px-3.5 py-1 text-xs font-semibold text-pp-on-secondary-container tracking-wide uppercase">
          <Zap className="h-3.5 w-3.5 text-pp-secondary" />
          Transparent Usage-Based Pricing
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-pp-on-surface font-pp-display sm:text-5xl">
          Only Pay for Visitors in Active Experiments.
        </h1>
        <p className="text-sm text-pp-on-surface-variant sm:text-base max-w-2xl mx-auto leading-relaxed">
          Never get billed for aggregate site traffic. Our Monthly Tested User (MTU) model ensures you only pay when an experiment actually runs on a visitor.
        </p>

        {/* Monthly / Annual Toggle */}
        <div className="flex items-center justify-center gap-3 pt-3">
          <span
            className={`text-xs font-semibold transition-colors ${
              !annualBilling ? 'text-pp-on-surface font-bold' : 'text-pp-outline'
            }`}
          >
            Monthly Billing
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={annualBilling}
            onClick={() => setAnnualBilling(!annualBilling)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              annualBilling ? 'bg-pp-primary' : 'bg-pp-surface-container-high'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                annualBilling ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span
            className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
              annualBilling ? 'text-pp-on-surface font-bold' : 'text-pp-outline'
            }`}
          >
            Annual Billing
            <span className="rounded-full bg-pp-secondary-container px-2 py-0.5 text-[10px] font-bold text-pp-on-secondary-container">
              Save 25%
            </span>
          </span>
        </div>
      </div>

      {/* Top 4 Soft Pastel KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <PpCard className="p-5 flex flex-col justify-between shadow-pp-candy border border-pp-outline-variant/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pp-outline">Volume Tier</span>
            <div className="rounded-full bg-pp-primary-container/10 p-2 text-pp-primary">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-pp-display text-pp-on-surface">{formattedVolume}</div>
            <div className="text-xs text-pp-secondary flex items-center gap-1 mt-1 font-medium">
              <TrendingUp className="h-3.5 w-3.5" /> +12.4% vs last month
            </div>
          </div>
        </PpCard>

        {/* KPI 2 */}
        <PpCard className="p-5 flex flex-col justify-between shadow-pp-candy border border-pp-outline-variant/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pp-outline">Est. Monthly Cost</span>
            <div className="rounded-full bg-pp-tertiary-container/20 p-2 text-pp-tertiary">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-pp-display text-pp-on-surface">
              ${annualBilling ? currentTier.priceAnnual : currentTier.priceMonthly} / mo
            </div>
            <div className="text-xs text-pp-outline flex items-center gap-1 mt-1">
              {annualBilling ? 'Billed annually with 25% discount' : 'Billed monthly'}
            </div>
          </div>
        </PpCard>

        {/* KPI 3 */}
        <PpCard className="p-5 flex flex-col justify-between shadow-pp-candy border border-pp-outline-variant/30 bg-pp-secondary-container/15">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pp-on-secondary-container">Optimized Savings</span>
            <div className="rounded-full bg-pp-secondary-container p-2 text-pp-on-secondary-container">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-pp-display text-pp-secondary">
              -$75<span className="text-xs font-normal text-pp-on-surface-variant">/mo</span>
            </div>
            <div className="text-xs text-pp-secondary flex items-center gap-1 mt-1 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> AI Routing applied
            </div>
          </div>
        </PpCard>

        {/* KPI 4 */}
        <PpCard className="p-5 flex flex-col justify-between shadow-pp-candy border border-pp-outline-variant/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pp-outline">Free Sandboxes</span>
            <div className="rounded-full bg-pp-primary-container/10 p-2 text-pp-primary">
              <Cpu className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-pp-display text-pp-on-surface">3 Active</div>
            <div className="text-xs text-pp-outline flex items-center gap-1 mt-1">
              No overage risk on dev environments
            </div>
          </div>
        </PpCard>
      </div>

      {/* Interactive MTU Slider Card */}
      <PpCard className="p-6 md:p-8 shadow-pp-candy border border-pp-outline-variant/30 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-pp-on-surface font-pp-display">
              Estimate Your Monthly Tested Users (MTUs)
            </h2>
            <p className="mt-1 text-xs text-pp-on-surface-variant max-w-2xl">
              If 100,000 visitors land on your site but only 20,000 enter an active test or personalization variant, your usage is just 20,000 MTUs.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 bg-pp-surface-container-low px-3.5 py-1.5 rounded-full border border-pp-outline-variant/20 self-start md:self-auto">
            <span className="text-xs text-pp-outline">Overage Rate:</span>
            <span className="text-xs font-bold text-pp-primary">$0.0012 / user</span>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex justify-between items-center text-xs text-pp-outline font-semibold">
            <span>10k MTUs</span>
            <div className="bg-pp-primary-container text-white px-3.5 py-1 rounded-full font-bold font-pp-display text-sm shadow-sm">
              {mtu.toLocaleString()} MTUs
            </div>
            <span>1M+ MTUs</span>
          </div>
          <input
            type="range"
            min={10000}
            max={1000000}
            step={10000}
            value={mtu}
            onChange={(e) => setMtu(Number(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-pp-surface-container-high accent-pp-primary"
          />
        </div>

        {/* Live Ticks & Breakdown Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-pp-outline-variant/20">
          <div>
            <div className="text-[11px] font-semibold text-pp-outline">Base Allocation</div>
            <div className="text-sm font-bold font-pp-display text-pp-on-surface mt-0.5">100k Included</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-pp-outline">Overage Volume</div>
            <div className="text-sm font-bold font-pp-display text-pp-on-surface mt-0.5">
              {overageUsers > 0 ? `${(overageUsers / 1000).toFixed(0)}k Users` : '0 Users'}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-pp-outline">Estimated Overage Fee</div>
            <div className="text-sm font-bold font-pp-display text-pp-on-surface mt-0.5">
              ${overageFee.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-pp-outline">Effective Cost / MTU</div>
            <div className="text-sm font-bold font-pp-display text-pp-secondary mt-0.5">
              ${costPerMtu}
            </div>
          </div>
        </div>

        {/* Calculated Output Box */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-pp-primary/20 bg-pp-primary/5 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-pp-primary/10 p-2.5 text-pp-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-pp-on-surface-variant font-medium">Recommended Plan</div>
              <div className="text-base font-bold text-pp-primary font-pp-display">{currentTier.name}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold text-pp-primary font-pp-display">
              {mtu.toLocaleString()} <span className="text-xs font-normal text-pp-on-surface-variant">MTUs / mo</span>
            </div>
          </div>
        </div>
      </PpCard>

      {/* 3 Tier Grid + AI Plan Copilot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tier 1: Free Sandbox */}
        <PpCard className="flex flex-col justify-between p-6 md:p-8 shadow-pp-candy border border-pp-outline-variant/30">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-pp-on-surface font-pp-display">Free Sandbox</h3>
              <span className="text-[11px] bg-pp-surface-container-low text-pp-outline font-semibold px-2.5 py-0.5 rounded-full">
                Trial
              </span>
            </div>
            <p className="mt-1 text-xs text-pp-on-surface-variant">For early-stage startups and small sites.</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-pp-on-surface font-pp-display">$0</span>
              <span className="text-xs text-pp-outline">/ month</span>
            </div>
            <div className="mt-2 text-xs font-semibold text-pp-primary">100,000 MTUs permanently free</div>

            <ul className="mt-6 space-y-3 text-xs text-pp-on-surface-variant">
              {getTier(10000).features.map((feat, i) => (
                <li key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-pp-secondary shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            className="mt-8 w-full rounded-full border border-pp-outline-variant/40 bg-pp-surface-container-low hover:bg-pp-surface-container py-2.5 text-xs font-bold text-pp-on-surface transition-colors"
          >
            Start Free
          </button>
        </PpCard>

        {/* Tier 2: Growth Scale (Most Popular) */}
        <div className="relative flex flex-col justify-between rounded-3xl border-2 border-pp-primary bg-pp-surface-container-lowest p-6 md:p-8 shadow-pp-candy lg:-translate-y-2">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rtl:translate-x-1/2 rounded-full bg-pp-primary px-3.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
            Most Popular
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-pp-on-surface font-pp-display">Growth Scale</h3>
              <span className="rounded-full bg-pp-secondary-container px-2.5 py-0.5 text-[10px] font-bold text-pp-on-secondary-container">
                Active Plan
              </span>
            </div>
            <p className="mt-1 text-xs text-pp-on-surface-variant">For scaling SaaS & high-velocity e-commerce.</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-pp-on-surface font-pp-display">
                ${annualBilling ? '224' : '299'}
              </span>
              <span className="text-xs text-pp-outline">/ month</span>
            </div>
            <div className="mt-2 text-xs font-semibold text-pp-secondary">
              {annualBilling ? 'Billed annually ($2,688/yr)' : 'Billed monthly'}
            </div>

            <ul className="mt-6 space-y-3 text-xs text-pp-on-surface-variant">
              {getTier(200000).features.map((feat, i) => (
                <li key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-pp-secondary shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            className="mt-8 w-full rounded-full bg-pp-primary hover:bg-pp-primary/90 py-2.5 text-xs font-bold text-white transition-opacity shadow-md"
          >
            Start 14-Day Free Trial
          </button>
        </div>

        {/* Tier 3: Enterprise Unlimited */}
        <PpCard className="flex flex-col justify-between p-6 md:p-8 shadow-pp-candy border border-pp-outline-variant/30">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-pp-on-surface font-pp-display">Enterprise Unlimited</h3>
              <span className="text-[11px] bg-pp-tertiary-container/20 text-pp-tertiary font-semibold px-2.5 py-0.5 rounded-full">
                Custom
              </span>
            </div>
            <p className="mt-1 text-xs text-pp-on-surface-variant">For enterprise organizations with custom security.</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-pp-on-surface font-pp-display">Custom</span>
            </div>
            <div className="mt-2 text-xs font-semibold text-pp-outline">Millions of MTUs & custom SLAs</div>

            <ul className="mt-6 space-y-3 text-xs text-pp-on-surface-variant">
              {getTier(900000).features.map((feat, i) => (
                <li key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-pp-secondary shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            className="mt-8 w-full rounded-full border border-pp-outline-variant/40 bg-pp-surface-container-low hover:bg-pp-surface-container py-2.5 text-xs font-bold text-pp-on-surface transition-colors"
          >
            Contact Sales
          </button>
        </PpCard>
      </div>

      {/* AI Plan Copilot Card */}
      <PpCard className="p-6 md:p-8 shadow-pp-candy border border-pp-primary/30 bg-pp-surface-container-lowest">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-pp-primary-container/20 p-2.5 text-pp-primary">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-pp-on-surface font-pp-display">AI Plan Copilot</h3>
                <span className="bg-pp-secondary-container text-pp-on-secondary-container text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  Optimized
                </span>
              </div>
              <p className="text-xs text-pp-on-surface-variant mt-0.5">
                Based on your telemetry spikes over the last 14 days, our model suggests locking in annual prepay to capture peak savings.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-pp-primary hover:bg-pp-primary/90 px-6 py-2.5 text-xs font-bold text-white shadow-md transition-colors shrink-0"
          >
            <span>Upgrade Workspace Tier</span>
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-pp-outline-variant/20">
          <div className="flex items-start gap-3 bg-pp-surface-container-low p-4 rounded-2xl">
            <TrendingUp className="h-5 w-5 text-pp-primary shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-pp-on-surface">Traffic Surge Anticipated</div>
              <div className="text-xs text-pp-outline mt-0.5">
                Expect +25% Q3 volume growth based on current Google Ads CAC trends.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-pp-surface-container-low p-4 rounded-2xl">
            <ShieldCheck className="h-5 w-5 text-pp-secondary shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-pp-on-surface">Cost Savings Breakdown</div>
              <div className="text-xs text-pp-outline mt-0.5">
                You are saving <strong className="text-pp-secondary font-bold">$75/mo</strong> by dropping unused tracking pixels.
              </div>
            </div>
          </div>
        </div>
      </PpCard>
    </div>
  );
}
