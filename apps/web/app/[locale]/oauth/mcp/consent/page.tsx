import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import {
  AlertCircle,
  Bot,
  Check,
  Lock,
  Shield,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { listOrgProjects } from '@/lib/orgs/queries';
import { Button } from '@/components/ui/button';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'McpConsent' });
  return { title: t('metaTitle') };
}

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function formatClientDisplayName(clientId: string): string {
  const lower = clientId.toLowerCase();
  if (lower.includes('claude-desktop') || lower.includes('claude_desktop')) {
    return 'Claude Desktop';
  }
  if (lower.includes('claude.ai') || lower.includes('claude-ai')) {
    return 'claude.ai Connector';
  }
  if (lower.includes('cursor')) {
    return 'Cursor IDE';
  }
  if (lower.includes('antigravity')) {
    return 'Google Antigravity Agent';
  }
  return clientId;
}

/**
 * The login+consent step of KAN-75's MCP OAuth 2.1 flow (plan `12 §6.1`).
 * `apps/api`'s `GET /oauth/authorize` redirects an MCP client's browser
 * here, passing the whole authorization request through unchanged as query
 * params — this page stores nothing of its own; approving posts straight to
 * `POST /api/oauth/mcp/consent`, which re-validates everything (including
 * `client_id`/`redirect_uri` registration) and calls
 * `issueMcpAuthorizationCode` itself.
 */
export default async function McpConsentPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const clientId = firstValue(query.client_id);
  const redirectUri = firstValue(query.redirect_uri);
  const codeChallenge = firstValue(query.code_challenge);
  const codeChallengeMethod = firstValue(query.code_challenge_method);
  const state = firstValue(query.state);
  const scope = firstValue(query.scope);

  const t = await getTranslations('McpConsent');

  if (!clientId || !redirectUri || !codeChallenge) {
    return (
      <main className="container mx-auto flex max-w-lg flex-col gap-6 py-20 px-4">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-3" />
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t('heading')}</h1>
          <p role="alert" className="mt-2 text-sm text-destructive">
            {t('invalidRequest')}
          </p>
        </div>
      </main>
    );
  }

  const session = await getServerSession();
  if (!session) {
    const from = `/${locale}/oauth/mcp/consent?${new URLSearchParams(query as Record<string, string>).toString()}`;
    redirect(`/${locale}/login?from=${encodeURIComponent(from)}`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const activeMemberships = memberships.filter((membership) => isActiveMembershipStatus(membership.status));
  const eligibleMemberships = activeMemberships.filter((membership) =>
    can(bindings, { type: 'user', id: user.id }, 'mcp.read', { orgId: membership.organizationId }),
  );

  const projectsByOrg = await Promise.all(
    eligibleMemberships.map(async (membership) => ({
      membership,
      projects: await listOrgProjects(membership.organizationId),
    })),
  );
  const options = projectsByOrg.flatMap(({ membership, projects }) =>
    projects.map((project) => ({
      value: `${membership.organizationId}:${project.id}`,
      label: `${membership.organizationName} / ${project.name}`,
    })),
  );

  const clientDisplayName = formatClientDisplayName(clientId);
  const requestedScopes = scope ? scope.split(' ').filter(Boolean) : ['mcp.read'];

  return (
    <main className="container mx-auto flex max-w-xl flex-col gap-6 py-12 px-4 md:py-16">
      {/* Security Header & Badge */}
      <div className="flex flex-col items-center text-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary border border-primary/20">
          <Shield className="h-3.5 w-3.5" />
          {t('badge')}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {t('heading')}
        </h1>
        <p className="text-sm text-muted-foreground max-w-md">
          {t('description')}
        </p>
      </div>

      {/* Main Consent Card */}
      <div className="rounded-2xl border border-border bg-card shadow-lg p-6 sm:p-8 flex flex-col gap-6">
        {/* Requesting Application Header */}
        <div className="flex items-center gap-4 rounded-xl border border-border/80 bg-muted/40 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <Bot className="h-6 w-6" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground">{t('clientLabel')}</span>
            <span className="truncate text-base font-bold text-foreground">{clientDisplayName}</span>
            <span className="truncate text-xs font-mono text-muted-foreground">{clientId}</span>
          </div>
        </div>

        {/* Permissions & Scopes Breakdown */}
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('scopeDetailsTitle')}
          </h2>

          <div className="flex flex-col gap-2.5">
            {/* mcp.read (always present) */}
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3.5">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">{t('scopeMcpReadTitle')}</span>
                <span className="text-xs text-muted-foreground leading-relaxed">{t('scopeMcpReadDetail')}</span>
              </div>
            </div>

            {/* dashboards.write (if in scope) */}
            {requestedScopes.includes('dashboards.write') && (
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3.5">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{t('scopeDashboardsWriteTitle')}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{t('scopeDashboardsWriteDetail')}</span>
                </div>
              </div>
            )}

            {/* automation.execute (if in scope) */}
            {requestedScopes.includes('automation.execute') && (
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3.5">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Zap className="h-3.5 w-3.5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{t('scopeAutomationExecuteTitle')}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{t('scopeAutomationExecuteDetail')}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security & Data Isolation Notice */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{t('securityTitle')}</span>
            <span>{t('securityDetail')}</span>
          </div>
        </div>

        {options.length === 0 ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center">
            <p role="alert" className="text-sm font-medium text-destructive">
              {t('noEligibleProjects')}
            </p>
          </div>
        ) : (
          <form method="POST" action="/api/oauth/mcp/consent" className="flex flex-col gap-6">
            <input type="hidden" name="client_id" value={clientId} />
            <input type="hidden" name="redirect_uri" value={redirectUri} />
            <input type="hidden" name="code_challenge" value={codeChallenge} />
            <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
            <input type="hidden" name="state" value={state} />
            <input type="hidden" name="scope" value={scope} />

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="mcp-consent-target">
                {t('projectLabel')}
              </label>
              <select
                id="mcp-consent-target"
                name="target"
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
              <Button
                type="submit"
                name="decision"
                value="deny"
                variant="outline"
                className="w-full sm:w-auto text-sm"
              >
                {t('deny')}
              </Button>
              <Button
                type="submit"
                name="decision"
                value="approve"
                variant="default"
                className="w-full sm:w-auto text-sm gap-2 shadow-sm"
              >
                <Lock className="h-4 w-4" />
                {t('approve')}
              </Button>
            </div>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {t('cancelWarning')}
      </p>
    </main>
  );
}
