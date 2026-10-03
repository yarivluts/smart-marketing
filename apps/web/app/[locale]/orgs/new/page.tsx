import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { CreateOrganizationForm } from '@/components/orgs/create-organization-form';
import { getServerSession } from '@/lib/auth/get-server-session';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'NewOrgPage' });
  return { title: t('title') };
}

/**
 * Create Organization Workspace page (standalone full-page layout matching Stitch 62f0718c & 34eb7238).
 */
export default async function NewOrgPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2Fnew`);
  }

  const t = await getTranslations('NewOrgPage');

  return (
    <div className="min-h-screen bg-pp-surface-container-low text-pp-on-surface antialiased flex flex-col justify-between selection:bg-pp-primary-fixed selection:text-pp-on-primary-fixed relative overflow-x-hidden">
      {/* Ambient Pastel Glows */}
      <div className="absolute -top-24 -start-24 w-96 h-96 bg-pp-primary-fixed rounded-full blur-3xl opacity-40 pointer-events-none" />
      <div className="absolute top-1/2 -end-24 w-96 h-96 bg-pp-secondary-fixed rounded-full blur-3xl opacity-25 pointer-events-none" />

      {/* Top App Bar */}
      <header className="w-full bg-transparent z-10">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-pp-primary flex items-center justify-center text-pp-on-primary shadow-pp-candy">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-on-surface">GrowthOS</span>
              <span className="text-[11px] font-semibold text-pp-on-surface-variant uppercase tracking-wider">Workspaces</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pp-secondary-container/40 text-pp-on-secondary-container text-pp-label-sm font-bold">
              <span className="h-2 w-2 rounded-full bg-pp-secondary animate-pulse" />
              <span>SOC-2 Verified</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Centered Stage */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center py-8 md:py-12 px-4 sm:px-6">
        <div className="w-full max-w-5xl space-y-6">
          {/* Step Header */}
          <div className="text-center sm:text-start">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pp-surface-container mb-3 border border-pp-outline-variant/30">
              <span className="h-2 w-2 rounded-full bg-pp-primary" />
              <span className="text-pp-on-surface-variant text-pp-label-sm uppercase tracking-wider font-semibold">
                {t('stepIndicator')}
              </span>
            </div>
            <h1 className="font-pp-display text-pp-headline-xl font-bold tracking-tight text-pp-on-surface">
              {t('title')}
            </h1>
            <p className="text-pp-body-lg text-pp-on-surface-variant mt-1 max-w-2xl">
              {t('pageSubtitle')}
            </p>
          </div>

          {/* Bento Card */}
          <div className="bg-pp-surface-container-lowest rounded-3xl shadow-pp-candy p-6 sm:p-8 lg:p-10 border border-white/60">
            <CreateOrganizationForm />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-transparent z-10">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4 text-pp-body-sm text-pp-outline border-t border-pp-surface-container/60">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pp-secondary" />
            <p>© 2026 GrowthOS Inc. All rights reserved.</p>
          </div>
          <div className="flex items-center gap-6">
            <span className="hover:text-pp-on-surface transition-colors">Privacy Policy</span>
            <span className="hover:text-pp-on-surface transition-colors">Terms of Service</span>
            <span className="hover:text-pp-on-surface transition-colors">Security Compliance</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
