'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Activity } from 'lucide-react';

export function LandingFooter(): React.ReactElement {
  const t = useTranslations('HomePage');

  return (
    <footer className="w-full bg-white dark:bg-pp-surface-container-lowest border-t border-pp-outline-variant/30 py-10 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 flex flex-col md:flex-row justify-between items-center gap-6">
        {/* Brand Logo & Copyright */}
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-center sm:text-left">
          <Link href="/" className="flex items-center gap-2 text-pp-primary font-bold font-pp-display text-xl">
            <Activity className="h-5 w-5" aria-hidden />
            <span>GrowthOS</span>
          </Link>
          <span className="hidden sm:inline text-pp-outline-variant">|</span>
          <p className="text-xs sm:text-sm text-pp-on-surface-variant">
            © 2026 GrowthOS Inc. All rights reserved. Precision telemetry for modern revenue teams.
          </p>
        </div>

        {/* Legal & Status Links */}
        <div className="flex flex-wrap justify-center items-center gap-5 sm:gap-6 text-xs sm:text-sm font-semibold text-pp-on-surface-variant">
          <Link href="/privacy" className="hover:text-pp-primary transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-pp-primary transition-colors">
            Terms of Service
          </Link>
          <a href="#security" className="hover:text-pp-primary transition-colors">
            Security
          </a>
          <a href="#status" className="hover:text-pp-primary transition-colors flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-pp-secondary inline-block animate-pulse" />
            <span>Operational</span>
          </a>
          <a href="#changelog" className="hover:text-pp-primary transition-colors">
            Changelog
          </a>
        </div>
      </div>
    </footer>
  );
}
