import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects, queryProjectFunnelSteps } from '@/lib/orgs/queries';
import { buildFunnelView } from '@/lib/orgs/funnel-view';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Funnel' });
  return { title: t('metaTitle') };
}

/**
 * A project's confirmed funnel conversion (the `query_funnel` MCP tool's web admin counterpart) — the
 * same warehouse-backed, per-stage distinct-customer counts `mcp-tools.service.ts`'s
 * `queryProjectFunnelSteps` already exposes to an MCP-connected AI agent, but until now with no
 * human-facing home: the onboarding wizard (KAN-68) lets a human confirm which events map to which
 * funnel stage, yet there was no page anywhere that showed how that funnel actually converts, a real
 * gap against CLAUDE.md's "everything user-manageable gets an admin surface" rule. Wraps the read
 * through `queryProjectFunnelStepsForAdmin` so the three expected-not-buggy warehouse failure modes
 * degrade the page the same honest way the Customers/Segments pages already do, rather than crashing.
 * Stage labels reuse the `Onboarding.funnelStage` translations — the exact same `FunnelStageKey`
 * vocabulary the onboarding wizard's own funnel-confirmation step already renders, not a duplicated
 * copy. Gated on `dashboards.write`, the same "whole feature is admin-only" posture the Segments/Win
 * rules pages already establish for this nav section.
 */
export default async function FunnelPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Ffunnel`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const outcome = await queryProjectFunnelSteps(orgId, projectId);
  const view = buildFunnelView(outcome);

  const [t, tStage] = await Promise.all([getTranslations('Funnel'), getTranslations('Onboarding.funnelStage')]);

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      {view.kind === 'no_funnel' ? (
        <p className="text-muted-foreground">{t('noFunnel')}</p>
      ) : view.kind === 'warehouse_not_configured' ? (
        <p className="text-muted-foreground">{t('notConfigured')}</p>
      ) : view.kind === 'quota_exceeded' ? (
        <p className="text-muted-foreground">{t('quotaExceeded')}</p>
      ) : view.kind === 'query_error' ? (
        <p className="text-muted-foreground">{t('queryError')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.steps.map((step) => (
            <li key={step.stageKey + step.stepOrder} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{t('stepHeading', { order: step.stepOrder + 1, stage: tStage(step.stageKey) })}</span>
                <span className="text-muted-foreground">{t('stepConversion', { percent: step.conversionPercent })}</span>
              </div>
              <span className="text-muted-foreground">{t('stepCustomerCount', { count: step.customerCount })}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
