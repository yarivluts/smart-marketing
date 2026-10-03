import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';

export function LandingCta(): React.ReactElement {
  const t = useTranslations('HomePage');

  return (
    <section className="py-20 md:py-28 relative overflow-hidden">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card/90 p-8 sm:p-12 md:p-16 text-center shadow-soft-xl backdrop-blur-xl overflow-hidden">
          {/* Decorative Background Circles */}
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col items-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t('ctaBadge')}</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground max-w-2xl">
              {t('ctaHeadline')}
            </h2>

            <p className="mt-4 max-w-xl text-base sm:text-lg text-muted-foreground">
              {t('ctaSubtitle')}
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 w-full sm:w-auto">
              <Button asChild size="lg" className="w-full sm:w-auto bg-brand-gradient text-white shadow-soft-lg hover:opacity-95 text-base px-8 h-12">
                <Link href="/dashboard" className="flex items-center justify-center gap-2">
                  <span>{t('ctaButton')}</span>
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {t('ctaNoCard')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
