import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Bot, Terminal, Code2, ArrowRight, ShieldCheck, Database } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { listOrgProjects } from '@/lib/orgs/queries';
import { Button } from '@/components/ui/button';
import { mcpApiUrl } from '@/lib/orgs/mcp-api-url';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'McpHub' });
  return { title: t('metaTitle') };
}

export default async function TopLevelMcpPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (session) {
    const { memberships } = await resolveOrgSessionContext(session);
    const active = memberships.filter((m) => isActiveMembershipStatus(m.status));
    for (const membership of active) {
      const projects = await listOrgProjects(membership.organizationId);
      if (projects.length > 0) {
        redirect(`/${locale}/orgs/${membership.organizationId}/projects/${projects[0].id}/mcp`);
      }
    }
  }

  const t = await getTranslations('McpHub');
  const endpoint = mcpApiUrl();

  return (
    <main className="container mx-auto flex flex-col gap-12 py-16 px-4 md:px-8 max-w-5xl">
      {/* Hero section */}
      <div className="flex flex-col items-center text-center gap-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-pp-primary-fixed/40 px-4 py-1 font-pp-label-sm text-sm font-semibold text-pp-on-primary-fixed-variant border border-pp-primary/20">
          <Bot className="h-4 w-4" />
          Model Context Protocol (MCP)
        </div>
        <h1 className="font-pp-display text-4xl font-extrabold tracking-tight sm:text-5xl text-pp-on-surface">
          {t('title')}
        </h1>
        <p className="max-w-2xl font-pp-body-md text-base sm:text-lg text-pp-on-surface-variant leading-relaxed">
          {t('subtitle')}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="rounded-full gap-2 bg-pp-primary text-pp-on-primary hover:bg-pp-primary-container shadow-pp-candy">
            <a href={`/${locale}/login?from=%2Fmcp`}>
              Connect Your Workspace <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </a>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full gap-2 border-pp-outline-variant/60 text-pp-on-surface hover:bg-pp-surface-container">
            <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">
              Official MCP Docs
            </a>
          </Button>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-2xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-pp-candy">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pp-primary-fixed text-pp-primary">
            <Bot className="h-5 w-5" />
          </div>
          <h3 className="font-pp-display font-bold text-lg text-pp-on-surface">Claude Desktop & claude.ai</h3>
          <p className="font-pp-body-sm text-sm text-pp-on-surface-variant leading-relaxed">
            Native OAuth 2.1 integration with automatic discovery. Query marketing metrics and customer funnels directly in your chat.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-pp-candy">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pp-secondary-fixed text-pp-secondary">
            <Code2 className="h-5 w-5" />
          </div>
          <h3 className="font-pp-display font-bold text-lg text-pp-on-surface">Cursor & IDEs</h3>
          <p className="font-pp-body-sm text-sm text-pp-on-surface-variant leading-relaxed">
            Query metrics, examine CAC payback periods, and analyze conversion drop-offs without leaving your coding environment.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-pp-candy">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pp-tertiary-fixed text-pp-tertiary">
            <Terminal className="h-5 w-5" />
          </div>
          <h3 className="font-pp-display font-bold text-lg text-pp-on-surface">Antigravity & Autonomous Agents</h3>
          <p className="font-pp-body-sm text-sm text-pp-on-surface-variant leading-relaxed">
            Headless Python and Node.js SDK connections with scoped bearer tokens for automated daily digests and budget simulations.
          </p>
        </div>
      </div>

      {/* Protocol details banner */}
      <div className="flex flex-col gap-4 rounded-2xl border border-pp-outline-variant/60 bg-pp-surface-container-low p-6 sm:p-8 shadow-pp-candy">
        <div className="flex items-center gap-2 text-sm font-bold text-pp-on-surface">
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
          <span>Stateless Streamable HTTP Architecture</span>
        </div>
        <p className="font-pp-body-sm text-sm text-pp-on-surface-variant leading-relaxed">
          GrowthOS provides a dedicated MCP server running over Streamable HTTP (JSON-RPC 2.0). Every connection re-authenticates on each request with project-level isolation, single-use token rotation, and complete audit logging.
        </p>
        <div className="flex items-center gap-2 text-xs font-mono text-pp-on-surface-variant bg-pp-surface-container-lowest rounded-xl border border-pp-outline-variant/60 p-3">
          <Database className="h-4 w-4 text-pp-primary shrink-0" />
          <span className="truncate">POST {endpoint}</span>
        </div>
      </div>
    </main>
  );
}
