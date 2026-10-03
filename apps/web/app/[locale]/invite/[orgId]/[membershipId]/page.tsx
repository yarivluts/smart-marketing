import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  Sparkles,
  CheckCircle2,
  BarChart3,
  Share2,
  Bot,
  Bell,
  Mail,
  ShieldCheck,
  Lock,
  Zap,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { AcceptInviteButton } from '@/components/orgs/accept-invite-button';
import { SwitchAccountButton } from '@/components/orgs/switch-account-button';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { getInviteDetails } from '@/lib/orgs/queries';
import { PpButton, PpPill } from '@/components/pastel/primitives';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; membershipId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Invite' });
  return { title: t('title') };
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('') || 'OS';
}

/**
 * Public landing page for an org invite (KAN-25's join flow) — reachable
 * whether or not the visitor is signed in yet, since invites are often sent
 * before the invitee has an account. Rendered as a standalone Stitch frame
 * (lavender canvas, centered candy card, brand mark).
 */
export default async function InvitePage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, membershipId } = await params;
  setRequestLocale(locale);

  const invite = await getInviteDetails(orgId, membershipId);
  if (!invite) {
    notFound();
  }

  const t = await getTranslations('Invite');
  const orgInitials = getInitials(invite.organizationName);

  const session = await getServerSession();
  const fromPath = `/invite/${orgId}/${membershipId}`;

  let isMatch = false;
  if (session) {
    const { user } = await resolveOrgSessionContext(session);
    isMatch = user.id === invite.inviteeUserId;
  }

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
              <span className="text-[11px] font-semibold text-pp-on-surface-variant uppercase tracking-wider">Enterprise</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pp-secondary-container/40 text-pp-on-secondary-container text-pp-label-sm font-bold">
              <span className="h-2 w-2 rounded-full bg-pp-secondary animate-pulse" />
              <span>Security Verified</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Centered Stage */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 md:py-12">
        <div className="w-full max-w-[700px]">
          {/* Floating Candy Card */}
          <div className="bg-pp-surface-container-lowest rounded-3xl p-6 sm:p-10 shadow-pp-candy border border-white/60 transition-all duration-300">
            {/* Header: Organization Identity & Status */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-pp-surface-container">
              <div className="flex items-center gap-3.5">
                {/* Organization Monogram */}
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-pp-primary to-pp-primary-container flex items-center justify-center text-pp-on-primary font-pp-display text-pp-headline-md font-bold shadow-md shadow-pp-primary/20 shrink-0">
                  {orgInitials}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h1 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
                      {invite.organizationName}
                    </h1>
                    <CheckCircle2 className="h-5 w-5 text-pp-primary" />
                  </div>
                  <p className="text-pp-body-sm text-pp-on-surface-variant flex items-center gap-2 mt-0.5">
                    <span>Enterprise Growth Workspace</span>
                    <span className="h-1 w-1 rounded-full bg-pp-outline-variant" />
                    <span className="text-pp-secondary font-semibold">Active Tier</span>
                  </p>
                </div>
              </div>

              {/* Category Pill */}
              <PpPill accent="primary">
                {t('workspaceBadge')}
              </PpPill>
            </div>

            {/* Inviter Context Banner */}
            <div className="mt-6 p-4 rounded-2xl bg-pp-surface-container-low flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-pp-primary-fixed text-pp-primary font-bold flex items-center justify-center text-pp-label-md shrink-0">
                  {invite.organizationName[0]?.toUpperCase() ?? 'G'}
                </div>
                <div className="truncate">
                  <p className="text-pp-body-sm text-pp-on-surface">
                    <strong className="font-bold text-pp-on-surface">{invite.organizationName}</strong> invited you to join
                  </p>
                  <p className="text-pp-body-md font-semibold text-pp-primary truncate">
                    {t('leadAnalyst')}
                  </p>
                </div>
              </div>
              <PpPill accent="mint" className="hidden sm:inline-flex">
                {t('teamDirect')}
              </PpPill>
            </div>

            {/* Target Identity & Seat Details */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <span className="text-pp-label-sm uppercase font-semibold text-pp-outline">{t('targetIdentity')}:</span>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pp-surface-container text-pp-on-surface text-pp-body-sm">
                  <Mail className="h-3.5 w-3.5 text-pp-on-surface-variant" />
                  <span className="font-medium">{invite.inviteeEmail}</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-pp-label-sm text-pp-on-surface-variant bg-pp-surface-container px-2.5 py-0.5 rounded-full font-semibold">
                <ShieldCheck className="h-3.5 w-3.5 text-pp-primary" />
                <span>{t('reservedSeat')}</span>
              </span>
            </div>

            {/* Provisioned Workspace Entitlements */}
            <div className="mt-6">
              <h2 className="text-pp-label-sm font-semibold uppercase text-pp-outline tracking-wider mb-3">
                {t('entitlementsHeading')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-pp-surface-container-low/70 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-pp-label-md font-bold text-pp-on-surface">{t('entitlementDashboardsTitle')}</p>
                    <p className="text-pp-body-sm text-pp-on-surface-variant">{t('entitlementDashboardsDesc')}</p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-pp-surface-container-low/70 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-xl bg-pp-tertiary-fixed text-pp-tertiary flex items-center justify-center shrink-0">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-pp-label-md font-bold text-pp-on-surface">{t('entitlementAttributionTitle')}</p>
                    <p className="text-pp-body-sm text-pp-on-surface-variant">{t('entitlementAttributionDesc')}</p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-pp-surface-container-low/70 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-xl bg-pp-primary-fixed text-pp-primary flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-pp-label-md font-bold text-pp-on-surface">{t('entitlementAgentTitle')}</p>
                    <p className="text-pp-body-sm text-pp-on-surface-variant">{t('entitlementAgentDesc')}</p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-pp-surface-container-low/70 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-xl bg-pp-secondary-container text-pp-on-secondary-container flex items-center justify-center shrink-0">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-pp-label-md font-bold text-pp-on-surface">{t('entitlementAlertsTitle')}</p>
                    <p className="text-pp-body-sm text-pp-on-surface-variant">{t('entitlementAlertsDesc')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action CTAs Section */}
            <div className="mt-8 space-y-4">
              {invite.status !== 'invited' ? (
                <div className="p-4 rounded-2xl bg-pp-surface-container-low text-center">
                  <h3 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">{t('title')}</h3>
                  <p className="text-pp-body-md text-pp-on-surface-variant mt-1">{t('alreadyResolved')}</p>
                </div>
              ) : !session ? (
                <div className="space-y-4 text-center">
                  <p className="text-pp-body-md text-pp-on-surface-variant">
                    {t('description', { organizationName: invite.organizationName, email: invite.inviteeEmail })}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <PpButton asChild variant="primary" className="w-full h-12 rounded-full font-pp-display text-pp-body-lg font-bold shadow-pp-candy">
                      <Link href={{ pathname: '/login', query: { from: fromPath } }}>
                        <span>{t('signInToAccept')}</span>
                        <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                      </Link>
                    </PpButton>
                    <PpButton asChild variant="secondary" className="w-full h-12 rounded-full font-pp-display text-pp-body-lg font-bold shadow-pp-candy">
                      <Link href={{ pathname: '/signup', query: { from: fromPath } }}>
                        <span>{t('signUpToAccept')}</span>
                      </Link>
                    </PpButton>
                  </div>
                </div>
              ) : isMatch ? (
                <div className="space-y-4">
                  <p className="text-center text-pp-body-md text-pp-on-surface-variant">
                    {t('description', { organizationName: invite.organizationName, email: invite.inviteeEmail })}
                  </p>
                  <AcceptInviteButton orgId={orgId} membershipId={membershipId} />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-pp-error-container/30 border border-pp-error/20 text-center">
                  <div className="flex items-center gap-2 text-pp-error font-semibold text-pp-body-md">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>{t('emailMismatch', { email: invite.inviteeEmail })}</span>
                  </div>
                  <SwitchAccountButton fromPath={fromPath} />
                </div>
              )}
            </div>

            {/* Trust & Security Meta Note */}
            <div className="mt-8 pt-4 border-t border-pp-surface-container text-center">
              <p className="text-pp-label-sm font-semibold text-pp-outline flex items-center justify-center gap-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-pp-secondary" />
                  <span>SSO Enforced</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5 text-pp-secondary" />
                  <span>256-bit TLS Encryption</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-pp-secondary" />
                  <span>Instant Pod Provisioning</span>
                </span>
              </p>
            </div>
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
