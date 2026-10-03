import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function LandingFooter(): React.ReactElement {
  const t = useTranslations('HomePage');

  return (
    <footer className="border-t border-border/40 bg-background/80 py-12 text-sm text-muted-foreground">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand and Copyright */}
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left rtl:sm:text-right">
            <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient text-white">
                <Activity className="h-4 w-4" />
              </div>
              <span>GrowthOS</span>
            </Link>
            <span className="hidden sm:inline text-border">|</span>
            <p className="text-xs">
              &copy; {new Date().getFullYear()} GrowthOS Inc. {t('footerRights')}
            </p>
          </div>

          {/* Status & Locale Switcher */}
          <div className="flex flex-wrap items-center gap-4">
            <Badge variant="emerald" dot size="sm" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              <span>{t('footerStatus')}</span>
            </Badge>
            <LocaleSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
}
