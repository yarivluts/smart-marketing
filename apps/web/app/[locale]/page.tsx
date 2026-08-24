import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  Activity,
  ArrowRight,
  Bot,
  Building2,
  LayoutGrid,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { AccountStatus } from '@/components/auth/account-status';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function HomePage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('HomePage');
  const tMeta = await getTranslations('Metadata');

  const features = [
    {
      title: t('feature1Title'),
      description: t('feature1Desc'),
      icon: Activity,
    },
    {
      title: t('feature2Title'),
      description: t('feature2Desc'),
      icon: LayoutGrid,
    },
    {
      title: t('feature3Title'),
      description: t('feature3Desc'),
      icon: Bot,
    },
    {
      title: t('feature4Title'),
      description: t('feature4Desc'),
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/80 bg-background/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-soft">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">{tMeta('title')}</span>
        </div>

        <div className="flex items-center gap-4">
          <LocaleSwitcher />
          <AccountStatus />
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto flex flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:py-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary shadow-soft mb-6">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{tMeta('description')}</span>
        </div>

        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">
          <span className="bg-brand-gradient bg-clip-text text-transparent">{t('title')}</span>
        </h1>

        <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {t('subtitle')}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="rounded-xl shadow-soft">
            <Link href="/dashboard">
              <span>{t('getStarted')}</span>
              <ArrowRight className="ms-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-xl">
            <Link href="/dashboard">{t('goToDashboard')}</Link>
          </Button>
        </div>

        {/* Feature Highlights Grid */}
        <section className="mt-20 grid w-full max-w-5xl grid-cols-1 gap-6 text-start sm:grid-cols-2 lg:grid-cols-4" aria-label="Feature Highlights">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.title}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-soft-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="text-base font-bold text-foreground">{feature.title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{feature.description}</p>
              </Card>
            );
          })}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/80 py-6 text-center text-xs text-muted-foreground">
        <p>{t('footerText')}</p>
      </footer>
    </div>
  );
}

