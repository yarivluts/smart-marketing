'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Activity, ArrowRight, Menu, X } from 'lucide-react';

export function LandingHeader(): React.ReactElement {
  const t = useTranslations('HomePage');
  const tShell = useTranslations('AppShell');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // Close mobile drawer on Escape key press
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    }

    if (isMobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isMobileMenuOpen]);

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] sm:w-[calc(100%-2rem)] max-w-7xl z-50 pointer-events-none transition-all">
        {/* Main Floating Pill */}
        <div className="pointer-events-auto rounded-full bg-white/90 dark:bg-pp-surface-container-lowest/90 backdrop-blur-md border border-pp-outline-variant/40 shadow-[0_4px_24px_-2px_rgba(82,67,213,0.08)] flex items-center justify-between px-3.5 sm:px-6 py-2.5 sm:py-3 w-full transition-all">
          {/* Brand Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 sm:gap-2.5 active:scale-[0.98] transition-transform shrink-0"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-pp-primary flex items-center justify-center text-white shadow-sm shadow-pp-primary/30 shrink-0">
              <Activity className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-pp-display text-lg sm:text-xl text-pp-primary font-bold tracking-tight">
                GrowthOS
              </span>
              <span className="bg-pp-primary-fixed text-pp-on-primary-fixed text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider hidden sm:inline-block">
                Studio
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-semibold text-pp-on-surface-variant">
            <a href="#product" className="hover:text-pp-primary transition-colors">
              {t('navFeatures')}
            </a>
            <a href="#features" className="hover:text-pp-primary transition-colors">
              {t('navArchitecture')}
            </a>
            <a
              href="#pricing"
              className="text-pp-primary font-bold hover:text-pp-primary transition-colors flex items-center gap-1"
            >
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

          {/* Desktop Trailing Actions */}
          <div className="hidden md:flex items-center gap-2.5 sm:gap-3">
            <LocaleSwitcher hideLabel />
            <Link
              href="/login"
              className="text-xs sm:text-sm font-semibold text-pp-on-surface hover:text-pp-primary transition-colors px-3 py-1.5"
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

          {/* Mobile Actions (< md) */}
          <div className="flex md:hidden items-center gap-2 shrink-0">
            <LocaleSwitcher hideLabel />
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-expanded={isMobileMenuOpen}
              aria-label={isMobileMenuOpen ? tShell('closeMenu') : tShell('openMenu')}
              className="w-8 h-8 rounded-full bg-pp-surface-container-high/80 hover:bg-pp-surface-container-highest text-pp-on-surface flex items-center justify-center transition-all active:scale-95 border border-pp-outline-variant/30"
            >
              {isMobileMenuOpen ? (
                <X className="h-4 w-4 text-pp-primary" aria-hidden />
              ) : (
                <Menu className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer Dropdown */}
        {isMobileMenuOpen && (
          <div className="pointer-events-auto md:hidden mt-2 rounded-3xl bg-white/95 dark:bg-pp-surface-container-lowest/95 backdrop-blur-xl border border-pp-outline-variant/50 shadow-[0_12px_36px_-6px_rgba(82,67,213,0.20)] p-5 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <nav className="flex flex-col gap-1">
              <a
                href="#product"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-pp-on-surface hover:bg-pp-surface-container-low active:bg-pp-surface-container transition-colors"
              >
                <span>{t('navFeatures')}</span>
                <ArrowRight className="h-3.5 w-3.5 text-pp-on-surface-variant/70 rtl:rotate-180" aria-hidden />
              </a>
              <a
                href="#features"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-pp-on-surface hover:bg-pp-surface-container-low active:bg-pp-surface-container transition-colors"
              >
                <span>{t('navArchitecture')}</span>
                <ArrowRight className="h-3.5 w-3.5 text-pp-on-surface-variant/70 rtl:rotate-180" aria-hidden />
              </a>
              <a
                href="#pricing"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-pp-primary bg-pp-primary-container/20 hover:bg-pp-primary-container/30 active:bg-pp-primary-container/40 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span>{t('navSolutions')}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-pp-primary inline-block" />
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-pp-primary rtl:rotate-180" aria-hidden />
              </a>
              <a
                href="#calculator"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-pp-on-surface hover:bg-pp-surface-container-low active:bg-pp-surface-container transition-colors"
              >
                <span>{t('calcBadge')}</span>
                <ArrowRight className="h-3.5 w-3.5 text-pp-on-surface-variant/70 rtl:rotate-180" aria-hidden />
              </a>
              <a
                href="#faq"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-pp-on-surface hover:bg-pp-surface-container-low active:bg-pp-surface-container transition-colors"
              >
                <span>{t('faqBadge')}</span>
                <ArrowRight className="h-3.5 w-3.5 text-pp-on-surface-variant/70 rtl:rotate-180" aria-hidden />
              </a>
            </nav>

            <div className="h-px w-full bg-pp-outline-variant/30" />

            {/* Mobile CTAs */}
            <div className="flex flex-col gap-2.5 pt-1">
              <Link
                href="/signup"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full bg-pp-primary hover:bg-pp-primary-container text-white text-sm font-semibold py-3 rounded-2xl shadow-[0_8px_20px_-4px_rgba(112,100,244,0.35)] text-center flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <span>{t('startTrial')}</span>
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Link>
              <Link
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full border border-pp-outline-variant/60 hover:bg-pp-surface-container text-pp-on-surface text-sm font-semibold py-2.5 rounded-2xl text-center transition-all active:scale-[0.98]"
              >
                {t('signIn')}
              </Link>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
