'use client';

import * as React from 'react';
import { CreditCard, Database, Layers, Radio, Share2 } from 'lucide-react';

export function LandingConnectors(): React.ReactElement {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mb-20 sm:mb-24">
      <p className="text-center font-mono font-bold text-[11px] text-pp-outline uppercase tracking-widest mb-6">
        Native Telemetry Connectors &amp; Data Pipeline Sync
      </p>
      <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 md:gap-10 opacity-80 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-2 font-pp-display text-base sm:text-lg font-bold text-pp-on-surface-variant hover:text-pp-primary transition-colors">
          <CreditCard className="h-5 w-5 text-pp-primary" />
          <span>Stripe</span>
        </div>
        <div className="flex items-center gap-2 font-pp-display text-base sm:text-lg font-bold text-pp-on-surface-variant hover:text-pp-primary transition-colors">
          <Radio className="h-5 w-5 text-sky-500" />
          <span>Google Ads</span>
        </div>
        <div className="flex items-center gap-2 font-pp-display text-base sm:text-lg font-bold text-pp-on-surface-variant hover:text-pp-primary transition-colors">
          <Share2 className="h-5 w-5 text-blue-600" />
          <span>Meta Marketing</span>
        </div>
        <div className="flex items-center gap-2 font-pp-display text-base sm:text-lg font-bold text-pp-on-surface-variant hover:text-pp-primary transition-colors">
          <Layers className="h-5 w-5 text-pink-500" />
          <span>TikTok Ads</span>
        </div>
        <div className="flex items-center gap-2 font-pp-display text-base sm:text-lg font-bold text-pp-on-surface-variant hover:text-pp-primary transition-colors">
          <Database className="h-5 w-5 text-cyan-500" />
          <span>Snowflake</span>
        </div>
        <div className="flex items-center gap-2 font-pp-display text-base sm:text-lg font-bold text-pp-on-surface-variant hover:text-pp-primary transition-colors">
          <Database className="h-5 w-5 text-blue-500" />
          <span>BigQuery</span>
        </div>
        <div className="flex items-center gap-2 font-pp-display text-base sm:text-lg font-bold text-pp-on-surface-variant hover:text-pp-primary transition-colors">
          <Share2 className="h-5 w-5 text-amber-500" />
          <span>HubSpot CRM</span>
        </div>
      </div>
    </section>
  );
}
