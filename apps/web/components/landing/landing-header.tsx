import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Activity, ArrowRight } from 'lucide-react';

export function LandingHeader(): React.ReactElement {
  const t = useTranslations('HomePage');

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-soft transition-transform group-hover:scale-105">
            <Activity className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">
              GrowthOS
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary border border-primary/20">
              2.0
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-semibold text-muted-foreground">
          <a href="#demo" className="transition-colors hover:text-foreground">
            {t('demoTabPulse')}
          </a>
          <a href="#calculator" className="transition-colors hover:text-foreground">
            {t('calcBadge')}
          </a>
          <a href="#experiment-lab" className="transition-colors hover:text-foreground">
            {t('labBadge')}
          </a>
          <a href="#comparison" className="transition-colors hover:text-foreground">
            {t('navComparison')}
          </a>
          <Link href="/pricing" className="transition-colors hover:text-foreground">
            {t('navSolutions')}
          </Link>
          <a href="#faq" className="transition-colors hover:text-foreground">
            {t('faqBadge')}
          </a>
        </nav>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <LocaleSwitcher />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-xs font-bold">
            <Link href="/login">{t('signIn')}</Link>
          </Button>
          <Button asChild size="sm" className="bg-brand-gradient text-white hover:opacity-95 shadow-soft text-xs font-bold h-9">
            <Link href="/dashboard" className="flex items-center gap-1.5">
              <span>{t('launchPlatform')}</span>
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
