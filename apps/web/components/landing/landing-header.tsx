'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Activity, ArrowRight } from 'lucide-react';

export function LandingHeader(): React.ReactElement {
  const t = useTranslations('HomePage');

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-7xl rounded-full z-50 bg-white/85 dark:bg-pp-surface-container-lowest/85 backdrop-blur-md border border-pp-outline-variant/40 shadow-[0_4px_24px_-2px_rgba(82,67,213,0.08)] transition-all">
      <div className="flex items-center justify-between px-5 sm:px-6 py-3 w-full">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 active:scale-[0.98] transition-transform">
          <div className="w-9 h-9 rounded-full bg-pp-primary flex items-center justify-center text-white shadow-sm shadow-pp-primary/30">
            <Activity className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-pp-display text-xl text-pp-primary font-bold tracking-tight">
              GrowthOS
            </span>
            <span className="bg-pp-primary-fixed text-pp-on-primary-fixed text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider hidden sm:inline-block">
              Studio
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-semibold text-pp-on-surface-variant">
          <a href="#product" className="hover:text-pp-primary transition-colors">
            {t('navFeatures')}
          </a>
          <a href="#features" className="hover:text-pp-primary transition-colors">
            {t('navArchitecture')}
          </a>
          <a href="#pricing" className="text-pp-primary font-bold hover:text-pp-primary transition-colors flex items-center gap-1">
            <span>{t('navSolutions')}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-pp-primary inline-block" />
          </a>
          <a href="#calculator" className="hover:text-pp-primary transition-colors">
            {t('calcBadge')}
          </a>
          <a href="#faq" className="hover:text-pp-primary transition-colors">
            {t('faqBadge')}
          </a>
        </nav>

        {/* Trailing Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <LocaleSwitcher />
          <Link
            href="/login"
            className="hidden sm:inline-flex text-xs sm:text-sm font-semibold text-pp-on-surface hover:text-pp-primary transition-colors px-3 py-1.5"
          >
            {t('signIn')}
          </Link>
          <Link
            href="/signup"
            className="bg-pp-primary hover:bg-pp-primary-container text-white text-xs sm:text-sm font-semibold px-4 sm:px-5 py-2 sm:py-2.5 rounded-full shadow-[0_8px_20px_-4px_rgba(112,100,244,0.35)] hover:shadow-pp-primary/30 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <span>{t('startTrial')}</span>
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
