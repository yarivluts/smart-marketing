'use client';

import React, { useState } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';

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

  return (
    <div className="space-y-16 py-8" data-testid="pricing-mtu-calculator">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary tracking-wide uppercase">
          Transparent Usage-Based Pricing
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Only Pay for Visitors in Active Experiments.
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base max-w-2xl mx-auto">
          Never get billed for aggregate site traffic. Our Monthly Tested User (MTU) model ensures you only pay when an experiment actually runs on a visitor.
        </p>

        {/* Monthly / Annual Toggle */}
        <div className="flex items-center justify-center gap-3 pt-4">
          <span
            className={`text-xs font-semibold ${
              !annualBilling ? 'text-foreground' : 'text-muted-foreground'
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
              annualBilling ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                annualBilling ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span
            className={`flex items-center gap-1.5 text-xs font-semibold ${
              annualBilling ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            Annual Billing
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              Save 25%
            </span>
          </span>
        </div>
      </div>

      {/* Interactive MTU Slider Card */}
      <div className="rounded-3xl border border-border bg-card p-8 md:p-12 shadow-sm text-center max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Estimate Your Monthly Tested Users (MTUs)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl mx-auto">
            If 100,000 visitors land on your site but only 20,000 enter an active test or personalization variant, your usage is just 20,000 MTUs.
          </p>
        </div>

        <div className="max-w-2xl mx-auto space-y-4">
          <input
            type="range"
            min={10000}
            max={1000000}
            step={10000}
            value={mtu}
            onChange={(e) => setMtu(Number(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground font-mono">
            <span>10k MTUs</span>
            <span>500k MTUs</span>
            <span>1M+ MTUs</span>
          </div>
        </div>

        {/* Calculated Output Box */}
        <div className="inline-flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-primary/5 p-6 min-w-[280px]">
          <div className="text-3xl font-extrabold text-primary">
            {mtu.toLocaleString()} MTUs <span className="text-xs font-normal text-muted-foreground">/ mo</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-foreground font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Recommended Tier: <strong className="text-primary">{currentTier.name}</strong>
          </div>
        </div>
      </div>

      {/* 3 Tier Grid */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3 max-w-6xl mx-auto">
        {/* Tier 1: Free Sandbox */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-foreground">Free Sandbox</h3>
            <p className="mt-1 text-xs text-muted-foreground">For early-stage startups and small sites.</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-foreground">$0</span>
              <span className="text-xs text-muted-foreground">/ month</span>
            </div>
            <div className="mt-2 text-xs font-medium text-primary">100,000 MTUs permanently free</div>

            <ul className="mt-8 space-y-3 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Visual DOM Studio & Prompt-to-DOM
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Native GA4 Goal Sync
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Standard Client-Side Testing
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 1 Verified Domain
              </li>
            </ul>
          </div>

          <button
            type="button"
            className="mt-8 w-full rounded-xl border border-border bg-card py-2.5 text-xs font-bold text-foreground hover:bg-muted transition-colors"
          >
            Start Free
          </button>
        </div>

        {/* Tier 2: Growth Scale (Most Popular) */}
        <div className="relative flex flex-col justify-between rounded-3xl border-2 border-primary bg-card p-8 shadow-md">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
            Most Popular
          </div>

          <div>
            <h3 className="text-lg font-bold text-foreground">Growth Scale</h3>
            <p className="mt-1 text-xs text-muted-foreground">For scaling SaaS & high-velocity e-commerce.</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-foreground">
                ${annualBilling ? '224' : '299'}
              </span>
              <span className="text-xs text-muted-foreground">/ month</span>
            </div>
            <div className="mt-2 text-xs font-medium text-emerald-600">
              {annualBilling ? 'Billed annually ($2,688/yr)' : 'Billed monthly'}
            </div>

            <ul className="mt-8 space-y-3 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Up to 500,000 MTUs / month
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Automated Cost Guardrails & Kill Switch
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Multi-Touch Attribution Engine
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> AI Copilot Action Automations
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Sub-20ms Edge Script Footprint
              </li>
            </ul>
          </div>

          <button
            type="button"
            className="mt-8 w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
          >
            Start 14-Day Free Trial
          </button>
        </div>

        {/* Tier 3: Enterprise Unlimited */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-foreground">Enterprise Unlimited</h3>
            <p className="mt-1 text-xs text-muted-foreground">For enterprise organizations with custom security.</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-foreground">Custom</span>
            </div>
            <div className="mt-2 text-xs font-medium text-muted-foreground">Millions of MTUs & custom SLAs</div>

            <ul className="mt-8 space-y-3 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Dedicated Private VPC Infrastructure
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Direct BigQuery & Snowflake Export
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Custom Attribution Modeling & CRM Feeds
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Dedicated Customer Success Manager
              </li>
            </ul>
          </div>

          <button
            type="button"
            className="mt-8 w-full rounded-xl border border-border bg-card py-2.5 text-xs font-bold text-foreground hover:bg-muted transition-colors"
          >
            Contact Sales
          </button>
        </div>
      </div>
    </div>
  );
}
