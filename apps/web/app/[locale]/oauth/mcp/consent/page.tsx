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
  Sparkles,
  ArrowRight,
  ArrowLeftRight,
} from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { listOrgProjects } from '@/lib/orgs/queries';
import { PpButton, PpPill, ppInputClass } from '@/components/pastel/primitives';

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
 * Rendered as a standalone Stitch frame (lavender canvas, centered candy card, brand mark).
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
      <div className="min-h-screen bg-pp-surface-container-low text-pp-on-surface antialiased flex flex-col justify-between selection:bg-pp-primary-fixed selection:text-pp-on-primary-fixed relative overflow-x-hidden">
        <header className="w-full bg-transparent z-10">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-pp-primary flex items-center justify-center text-pp-on-primary shadow-pp-candy">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-on-surface">GrowthOS</span>
            </div>
          </div>
        </header>

        <main className="relative z-10 flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-pp-surface-container-lowest p-6 sm:p-8 shadow-pp-candy border border-white/60 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pp-error-container text-pp-error shadow-pp-candy">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h1 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">{t('heading')}</h1>
            <p role="alert" className="text-pp-body-md text-pp-error font-medium">
              {t('invalidRequest')}
            </p>
          </div>
        </main>

        <footer className="w-full bg-transparent py-4 text-center text-pp-body-sm text-pp-outline">
          © 2026 GrowthOS Inc. All rights reserved.
        </footer>
      </div>
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
              <span className="text-[11px] font-semibold text-pp-on-surface-variant uppercase tracking-wider">MCP Agent Studio</span>
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
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 md:py-12">
        <div className="w-full max-w-[660px] bg-pp-surface-container-lowest/95 backdrop-blur-xl rounded-3xl shadow-pp-candy p-6 sm:p-9 border border-white/60 relative space-y-6">
          {/* Top Badges and Agent Auth Handshake Visual */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-pp-surface-container">
            {/* Brand Handshake */}
            <div className="flex items-center gap-2">
              <div className="h-11 w-11 rounded-2xl bg-pp-primary flex items-center justify-center text-pp-on-primary shadow-pp-candy">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex items-center px-1 text-pp-outline">
                <span className="w-2.5 h-[2px] bg-pp-outline-variant" />
                <div className="h-6 w-6 rounded-full bg-pp-surface-container flex items-center justify-center text-pp-primary border border-pp-outline-variant/60 shadow-xs">
                  <ArrowLeftRight className="h-3 w-3" />
                </div>
                <span className="w-2.5 h-[2px] bg-pp-outline-variant" />
              </div>
              <div className="h-11 w-11 rounded-2xl bg-pp-tertiary-fixed flex items-center justify-center text-pp-on-tertiary-fixed shadow-xs">
                <Bot className="h-5 w-5 text-pp-tertiary" />
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <PpPill accent="primary">
                {t('badge')}
              </PpPill>
              <PpPill accent="mint">
                Verified Agent
              </PpPill>
            </div>
          </div>

          {/* Headline & Subtitle */}
          <div>
            <h1 className="font-pp-display text-pp-headline-lg font-bold text-pp-on-surface">
              {t('heading')}
            </h1>
            <p className="text-pp-body-md text-pp-on-surface-variant mt-1">
              {t('description')}
            </p>
          </div>

          {/* Requesting Application Header */}
          <div className="rounded-2xl bg-pp-surface-container-low p-4 space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pp-primary-fixed text-pp-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-pp-label-sm uppercase font-semibold text-pp-outline">{t('clientLabel')}</span>
                <span className="truncate font-pp-display text-pp-headline-md font-bold text-pp-on-surface">{clientDisplayName}</span>
                <span className="truncate text-pp-label-sm font-mono text-pp-outline">{clientId}</span>
              </div>
            </div>
          </div>

          {/* Permissions & Scopes Breakdown */}
          <div className="space-y-3">
            <h2 className="text-pp-label-sm font-semibold uppercase tracking-wider text-pp-outline">
              {t('scopeDetailsTitle')}
            </h2>

            <div className="space-y-2.5">
              {/* mcp.read (always present) */}
              <div className="flex items-start gap-3 rounded-2xl bg-pp-surface-container-low p-3.5">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pp-secondary-container text-pp-secondary">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <div>
                  <span className="text-pp-label-md font-bold text-pp-on-surface">{t('scopeMcpReadTitle')}</span>
                  <p className="text-pp-body-sm text-pp-on-surface-variant mt-0.5">{t('scopeMcpReadDetail')}</p>
                </div>
              </div>

              {/* dashboards.write (if in scope) */}
              {requestedScopes.includes('dashboards.write') && (
                <div className="flex items-start gap-3 rounded-2xl bg-pp-surface-container-low p-3.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pp-secondary-container text-pp-secondary">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="text-pp-label-md font-bold text-pp-on-surface">{t('scopeDashboardsWriteTitle')}</span>
                    <p className="text-pp-body-sm text-pp-on-surface-variant mt-0.5">{t('scopeDashboardsWriteDetail')}</p>
                  </div>
                </div>
              )}

              {/* automation.execute (if in scope) */}
              {requestedScopes.includes('automation.execute') && (
                <div className="flex items-start gap-3 rounded-2xl bg-pp-surface-container-low p-3.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Zap className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="text-pp-label-md font-bold text-pp-on-surface">{t('scopeAutomationExecuteTitle')}</span>
                    <p className="text-pp-body-sm text-pp-on-surface-variant mt-0.5">{t('scopeAutomationExecuteDetail')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Security & Data Isolation Notice */}
          <div className="rounded-2xl bg-pp-surface-container-low p-3.5 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-pp-secondary shrink-0 mt-0.5" />
            <div className="text-pp-body-sm text-pp-on-surface-variant space-y-0.5">
              <span className="font-semibold text-pp-on-surface block">{t('securityTitle')}</span>
              <span>{t('securityDetail')}</span>
            </div>
          </div>

          {options.length === 0 ? (
            <div className="rounded-2xl bg-pp-error-container p-4 text-center">
              <p role="alert" className="text-pp-body-md font-medium text-pp-on-error-container">
                {t('noEligibleProjects')}
              </p>
            </div>
          ) : (
            <form method="POST" action="/api/oauth/mcp/consent" className="space-y-6 pt-2">
              <input type="hidden" name="client_id" value={clientId} />
              <input type="hidden" name="redirect_uri" value={redirectUri} />
              <input type="hidden" name="code_challenge" value={codeChallenge} />
              <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
              <input type="hidden" name="state" value={state} />
              <input type="hidden" name="scope" value={scope} />

              <div className="space-y-1.5">
                <label className="block text-pp-label-md font-semibold text-pp-on-surface" htmlFor="mcp-consent-target">
                  {t('projectLabel')}
                </label>
                <select
                  id="mcp-consent-target"
                  name="target"
                  className={ppInputClass}
                >
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
                <PpButton
                  type="submit"
                  name="decision"
                  value="deny"
                  variant="secondary"
                  className="w-full sm:w-auto h-11 px-6 rounded-full"
                >
                  {t('deny')}
                </PpButton>
                <PpButton
                  type="submit"
                  name="decision"
                  value="approve"
                  variant="primary"
                  className="w-full sm:w-auto h-11 px-8 rounded-full font-pp-display text-pp-body-md font-bold shadow-pp-candy flex items-center justify-center gap-2"
                >
                  <Lock className="h-4 w-4" />
                  <span>{t('approve')}</span>
                </PpButton>
              </div>
            </form>
          )}

          <p className="text-center text-[11px] text-pp-outline">
            {t('cancelWarning')}
          </p>
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
