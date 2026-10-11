import { setRequestLocale } from 'next-intl/server';
import { getServerSession } from '@/lib/auth/get-server-session';
import { DocsHeader } from '@/components/developers/docs-header';
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
  const session = await getServerSession();

  return (
    <div className="flex min-h-screen flex-col bg-pp-surface-container-low text-pp-on-surface">
      <DocsHeader signedIn={Boolean(session)} />

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
