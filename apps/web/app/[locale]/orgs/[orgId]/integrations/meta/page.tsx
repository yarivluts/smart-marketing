import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { describeMetaOAuthSession, MetaOAuthError, type MetaOAuthChoices } from '@growthos/firebase-orm-models';
import { AlertTriangle, CheckCircle2, KeyRound, Link2 } from 'lucide-react';
import { OrgShell } from '@/components/orgs/org-shell';
import { PageHero } from '@/components/viz/page-hero';
import { ChartCard } from '@/components/viz/chart-card';
import { EmptyState } from '@/components/viz/empty-state';
import { MetaConnectChooser } from '@/components/integrations/meta-connect-chooser';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, listSharedCredentials } from '@/lib/orgs/queries';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { isMetaOAuthConfigured, metaConnectHref } from '@/lib/integrations/meta';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
  searchParams: Promise<{ session?: string; error?: string; detail?: string; projectId?: string }>;
}>;

const ERRORS = new Set(['not_configured', 'declined', 'meta_error', 'session_not_found', 'session_expired', 'wrong_user', 'not_authorized', 'exchange_failed', 'invalid_choice', 'no_ad_accounts']);

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'MetaConnect' });
  return { title: t('title') };
}

/**
 * "Connect with Facebook" for an org: starts Meta's consent flow, lets the person pick the ad account
 * and Page it brings back, and lists the org's Meta connections with when each one expires, so a
 * lapsing connection can be renewed. Needs `resources.manage` (it creates and attaches credentials).
 */
export default async function MetaConnectPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId } = await params;
  const { session: state, error, detail, projectId } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('MetaConnect');

  const session = await getServerSession();
  if (!session) redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fintegrations%2Fmeta`);
  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  if (!findActiveMembership(memberships, orgId)) notFound();
  const canManage = can(bindings, { type: 'user', id: user.id }, 'resources.manage', { orgId });
  const configured = isMetaOAuthConfigured();

  let choices: MetaOAuthChoices | null = null;
  let problem = error && ERRORS.has(error) ? error : error ? 'exchange_failed' : null;
  if (state && canManage && !problem) {
    await ensureFirestoreOrm();
    try {
      choices = await describeMetaOAuthSession({ state, userId: user.id });
      if (choices.organizationId !== orgId) {
        choices = null;
        problem = 'session_not_found';
      } else if (choices.adAccounts.length === 0) {
        problem = 'no_ad_accounts';
      }
    } catch (err) {
      if (!(err instanceof MetaOAuthError)) throw err;
      problem = err.code;
    }
  }

  const [projects, credentials] = await Promise.all([listOrgProjects(orgId), listSharedCredentials(orgId)]);
  const connections = credentials.filter((credential) => credential.provider === 'meta_ads' && !credential.archived_at);
  const startHref = metaConnectHref({ orgId, locale, projectId: projectId ?? choices?.projectId ?? null });
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const connectButton = (
    <a href={startHref} className="inline-flex items-center gap-2 rounded-xl bg-[#1877F2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#166fe0]" data-testid="meta-connect-start">
      <Link2 className="h-4 w-4" aria-hidden="true" />
      {connections.length ? t('reconnect') : t('connect')}
    </a>
  );

  return (
    <OrgShell locale={locale} orgId={orgId}>
      <div className="flex flex-col gap-6">
        <PageHero icon={Link2} eyebrow={t('eyebrow')} title={t('title')} description={t('description')} actions={canManage && configured && !choices ? connectButton : undefined} />

        {!canManage ? (
          <p role="note" className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            {t('needsPermission')}
          </p>
        ) : null}
        {canManage && !configured ? (
          <p role="note" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
            {t('errors.not_configured')}
          </p>
        ) : null}
        {problem && problem !== 'not_configured' ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm" data-testid="meta-connect-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="flex flex-col gap-2">
              <span>{t(`errors.${problem}`)}</span>
              {problem === 'meta_error' && detail ? (
                <span className="rounded-lg bg-muted/60 px-3 py-2 text-xs" dir="auto" data-testid="meta-connect-error-detail">
                  {detail.slice(0, 300)}
                </span>
              ) : null}
              {configured && canManage ? (
                <a href={startHref} className="font-medium text-primary hover:underline">
                  {t('tryAgain')}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {choices && !problem ? (
          <ChartCard title={t('chooseTitle')} description={t('chooseDescription')} icon={CheckCircle2}>
            <MetaConnectChooser
              locale={locale}
              orgId={orgId}
              session={state as string}
              adAccounts={choices.adAccounts}
              pages={choices.pages}
              projects={projects.map((project) => ({ id: project.id, name: project.name }))}
              defaultProjectId={choices.projectId}
              returnTo={choices.returnTo}
              tokenExpiresOn={choices.tokenExpiresOn}
            />
          </ChartCard>
        ) : null}

        <ChartCard title={t('connectionsTitle')} description={t('connectionsDescription')} icon={KeyRound}>
          {connections.length === 0 ? (
            <EmptyState compact icon={KeyRound} title={t('noConnections')} />
          ) : (
            <ul className="flex flex-col gap-2" data-testid="meta-connections">
              {connections.map((credential) => {
                const expires = credential.token_expires_on ? new Date(credential.token_expires_on) : null;
                const soon = expires ? expires.getTime() - Date.now() < 7 * 24 * 3600 * 1000 : false;
                return (
                  <li key={credential.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 text-sm">
                    <span className="font-medium" dir="auto">
                      {credential.name}
                    </span>
                    <span className={soon ? 'text-destructive' : 'text-muted-foreground'}>
                      {!credential.encrypted_secret
                        ? t('statusNoSecret')
                        : credential.connected_via !== 'oauth'
                          ? t('statusManual')
                          : expires
                            ? t(expires.getTime() < Date.now() ? 'statusExpired' : 'statusExpires', { date: dateFormat.format(expires) })
                            : t('statusNoExpiry')}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>
      </div>
    </OrgShell>
  );
}
