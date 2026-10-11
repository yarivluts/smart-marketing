import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Code2, Network } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { LanguageSwitcher } from '@/components/shell/language-switcher';
import { DocsNav } from '@/components/developers/docs-nav';

type LayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

/**
 * The public Developers area: guides for connecting a site or product to GrowthOS (API, MCP,
 * client- and server-side setup, test environments). Readable without an account - the people
 * integrating are often not GrowthOS users - and it owns the page's single main landmark.
 */
export default async function DevelopersLayout({ children, params }: LayoutProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, session] = await Promise.all([getTranslations('Developers'), getServerSession()]);

  return (
    <div className="flex min-h-screen flex-col bg-pp-surface-container-low text-pp-on-surface">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-pp-md border-b border-pp-outline-variant/30 bg-pp-surface-container-lowest/95 px-pp-md backdrop-blur lg:px-pp-lg">
        <div className="flex min-w-0 items-center gap-pp-md">
          <Link href="/" className="flex shrink-0 items-center gap-pp-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pp-primary text-pp-on-primary shadow-sm shadow-pp-primary/30">
              <Network className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="hidden font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-primary sm:inline">
              {t('brand')}
            </span>
          </Link>
          <Link href="/developers" className="flex items-center gap-1.5 rounded-full bg-pp-primary-fixed px-3 py-1 text-pp-label-md text-pp-on-primary-fixed">
            <Code2 className="h-4 w-4" aria-hidden="true" />
            {t('nav.area')}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-pp-sm">
          <LanguageSwitcher compact />
          <Link
            href={session ? '/dashboard' : '/login'}
            className="rounded-full bg-primary px-4 py-2 text-pp-label-md font-semibold text-primary-foreground shadow-pp-candy hover:bg-pp-primary-container"
          >
            {session ? t('nav.openApp') : t('nav.signIn')}
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-pp-xl px-4 py-pp-lg sm:px-6 lg:px-pp-xl">
        <aside className="sticky top-24 hidden h-fit w-60 shrink-0 lg:block">
          <DocsNav variant="sidebar" />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-pp-lg">
          <div className="lg:hidden">
            <DocsNav variant="pills" />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
