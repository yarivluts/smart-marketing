import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Video, ShieldCheck, ExternalLink, Link2, BookOpen, Layers } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';
import {
  PpPage,
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpPill,
} from '@/components/pastel/primitives';
import { SessionReplaySettingsForm } from '@/components/orgs/session-replay-settings-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'SessionReplaySettings' });
  return { title: t('metaTitle') };
}

/**
 * Where an admin points this project at its session-replay/heatmap tool, so
 * landing-page rows on a board deep-link into that page's recordings.
 *
 * Deliberately a link-out rather than replay this platform records itself:
 * capturing DOM mutations is a whole separate product (storage, a player,
 * sampling) with real privacy obligations, and the incumbents — Microsoft
 * Clarity free among them — already do it well. The value here is the join
 * this platform uniquely has: from "this page converts worse and costs
 * more" straight to the sessions behind it.
 *
 * Gated on `project.manage`, the same per-project admin-config permission
 * the cost-guardrails page uses.
 */
export default async function SessionReplaySettingsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fsession-replay`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/session-replay`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const t = await getTranslations('SessionReplaySettings');
  const hasTemplate = Boolean(project.session_replay_url_template?.trim());

  return (
    <PpPage>
      <PpPageHeader
        eyebrow={t('eyebrow')}
        title={t('title', { projectName: project.name })}
        description={t('intro')}
      />

      <PpKpiGrid>
        <PpKpiCard
          label={t('kpiStatus')}
          value={hasTemplate ? t('kpiStatusActive') : t('kpiStatusNotConfigured')}
          accent={hasTemplate ? 'mint' : 'neutral'}
        />
        <PpKpiCard
          label={t('kpiSupportedVendors')}
          value="4 Tested"
          accent="primary"
        />
        <PpKpiCard
          label="Target Parameter"
          value="{landing_page}"
          accent="neutral"
        />
        <PpKpiCard
          label={t('kpiPrivacyPosture')}
          value="Zero-DOM Scrub"
          accent="mint"
        />
      </PpKpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Configuration Card (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <PpCard
            title={t('templateLabel')}
            subtitle={t('intro')}
            icon={Link2}
            iconAccent="primary"
            action={
              hasTemplate ? (
                <PpPill accent="mint">{t('kpiStatusActive')}</PpPill>
              ) : (
                <PpPill accent="neutral">{t('kpiStatusNotConfigured')}</PpPill>
              )
            }
          >
            <SessionReplaySettingsForm
              orgId={orgId}
              projectId={projectId}
              initialTemplate={project.session_replay_url_template ?? ''}
              templateLabel={t('templateLabel')}
              templatePlaceholder={t('templatePlaceholder', { landing_page: '{landing_page}' })}
              templateHelp={t('templateHelp', { landing_page: '{landing_page}' })}
              saveLabel={t('save')}
              savedLabel={t('saved')}
              saveErrorLabel={t('saveError')}
              availableTokensHeading={t('availableTokensHeading')}
              previewHeading={t('previewHeading')}
            />
          </PpCard>
        </div>

        {/* Vendor Playbook & Recommendations (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <PpCard
            title={t('vendorsHeading')}
            subtitle="Recommended session recording tools and sample URL structures."
            icon={BookOpen}
            iconAccent="mint"
          >
            <div className="flex flex-col gap-4">
              {/* Microsoft Clarity */}
              <div className="p-3.5 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-pp-on-surface">Microsoft Clarity</span>
                  <PpPill accent="mint">Recommended · Free</PpPill>
                </div>
                <p className="text-xs text-pp-on-surface-variant">{t('clarityDesc')}</p>
                <code className="text-[11px] font-mono text-pp-primary bg-pp-surface-container px-2 py-1 rounded-lg break-all select-all">
                  https://clarity.microsoft.com/projects/view/PROJECT/impressions?Url={'{landing_page}'}
                </code>
              </div>

              {/* PostHog */}
              <div className="p-3.5 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-pp-on-surface">PostHog</span>
                  <PpPill accent="primary">Open Source</PpPill>
                </div>
                <p className="text-xs text-pp-on-surface-variant">{t('posthogDesc')}</p>
                <code className="text-[11px] font-mono text-pp-primary bg-pp-surface-container px-2 py-1 rounded-lg break-all select-all">
                  https://app.posthog.com/recordings?url={'{landing_page}'}
                </code>
              </div>

              {/* FullStory */}
              <div className="p-3.5 rounded-2xl bg-pp-surface-container-low/60 border border-pp-outline-variant/20 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-pp-on-surface">FullStory</span>
                  <PpPill accent="neutral">Enterprise</PpPill>
                </div>
                <p className="text-xs text-pp-on-surface-variant">{t('fullstoryDesc')}</p>
                <code className="text-[11px] font-mono text-pp-primary bg-pp-surface-container px-2 py-1 rounded-lg break-all select-all">
                  https://app.fullstory.com/ui/ORG/segments?filter=url:{'{landing_page}'}
                </code>
              </div>
            </div>
          </PpCard>
        </div>
      </div>
    </PpPage>
  );
}
