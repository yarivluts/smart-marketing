import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
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

/**
 * The login+consent step of KAN-75's MCP OAuth 2.1 flow (plan `12 §6.1`).
 * `apps/api`'s `GET /oauth/authorize` redirects an MCP client's browser
 * here, passing the whole authorization request through unchanged as query
 * params — this page stores nothing of its own; approving posts straight to
 * `POST /api/oauth/mcp/consent`, which re-validates everything (including
 * `client_id`/`redirect_uri` registration) and calls
 * `issueMcpAuthorizationCode` itself. See that route's own doc comment for
 * the rest of the flow.
 *
 * Only orgs/projects the signed-in user currently holds `mcp.read` in are
 * offered — the same permission `authenticateMcpAccessToken` re-checks on
 * every subsequent MCP tool call, so what's offered here is never broader
 * than what would actually work.
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
      <main className="container mx-auto flex max-w-lg flex-col gap-4 py-16">
        <h1 className="text-2xl font-bold tracking-tight">{t('heading')}</h1>
        <p role="alert" className="text-destructive">
          {t('invalidRequest')}
        </p>
      </main>
    );
  }

  const session = await getServerSession();
  if (!session) {
    const from = `/${locale}/oauth/mcp/consent?${new URLSearchParams(query as Record<string, string>).toString()}`;
    redirect(`/${locale}/login?from=${encodeURIComponent(from)}`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const activeMemberships = memberships.filter((membership) => membership.status !== 'invited');
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

  return (
    <main className="container mx-auto flex max-w-lg flex-col gap-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">{t('heading')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
      <p className="text-sm">{t('scopeReadDescription')}</p>

      {options.length === 0 ? (
        <p role="alert" className="text-destructive">
          {t('noEligibleProjects')}
        </p>
      ) : (
        <form method="POST" action="/api/oauth/mcp/consent" className="flex flex-col gap-4">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
          <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="scope" value={scope} />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="mcp-consent-target">
              {t('projectLabel')}
            </label>
            <select id="mcp-consent-target" name="target" className="h-10 rounded-md border border-input bg-background px-2 text-sm">
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="submit" name="decision" value="deny" variant="outline">
              {t('deny')}
            </Button>
            <Button type="submit" name="decision" value="approve">
              {t('approve')}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
