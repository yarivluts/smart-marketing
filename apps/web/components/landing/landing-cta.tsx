'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Lock, RefreshCw, Shield, Zap } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';

export function LandingCta(): React.ReactElement {
  const t = useTranslations('HomePage');
  const router = useRouter();
  const [email, setEmail] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      router.push(`/signup?email=${encodeURIComponent(email)}`);
    } else {
      router.push('/signup');
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 mb-20 sm:mb-24">
      <div className="bg-gradient-to-r from-pp-primary via-pp-primary to-pp-primary-container rounded-3xl p-8 sm:p-12 lg:p-16 text-white text-center relative overflow-hidden shadow-[0_8px_24px_-4px_rgba(112,100,244,0.2),0_24px_60px_-8px_rgba(112,100,244,0.28)]">
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 border border-white/20 text-white font-mono text-[11px] font-bold tracking-wider uppercase mb-6 backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5 text-amber-300" />
            <span>DEPLOY IN UNDER 15 MINUTES</span>
          </div>

          <h2 className="font-pp-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4 text-white">
            Ready to put your growth telemetry on autopilot?
          </h2>

          <p className="font-pp-body text-base sm:text-lg text-pp-surface-container-high mb-8 max-w-xl mx-auto leading-relaxed opacity-90">
            Sync your first data stream today. Join hundreds of hyper-growth marketing teams executing precision scale.
          </p>

          {/* Input + Button Action */}
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-lg mx-auto"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your work email..."
              required
              className="w-full px-5 py-3.5 rounded-full bg-white text-pp-on-surface placeholder:text-pp-outline border-0 focus:ring-4 focus:ring-pp-secondary-fixed outline-none text-sm shadow-sm"
            />
            <button
              type="submit"
              className="w-full sm:w-auto shrink-0 bg-white hover:bg-pp-surface-container-low text-pp-primary font-bold text-sm px-7 py-3.5 rounded-full shadow-md transition-all active:scale-[0.98]"
            >
              Start Free Trial
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-center gap-6 mt-8 font-mono text-[11px] text-pp-surface-container-high tracking-wider uppercase opacity-85">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-pp-secondary-container" />
              <span>SOC2 Type II Certified</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-pp-secondary-container" />
              <span>GDPR &amp; CCPA Compliant</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-pp-secondary-container" />
              <span>Zero API Rate Throttling</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
