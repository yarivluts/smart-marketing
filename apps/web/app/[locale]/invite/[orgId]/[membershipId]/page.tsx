import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { AcceptInviteButton } from '@/components/orgs/accept-invite-button';
import { SwitchAccountButton } from '@/components/orgs/switch-account-button';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { getInviteDetails } from '@/lib/orgs/queries';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; membershipId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Invite' });
  return { title: t('title') };
}

/**
 * Public landing page for an org invite (KAN-25's join flow) — reachable
 * whether or not the visitor is signed in yet, since invites are often sent
 * before the invitee has an account. See `middleware.ts`'s `/invite/` prefix
 * exemption.
 */
export default async function InvitePage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, membershipId } = await params;
  setRequestLocale(locale);

  const invite = await getInviteDetails(orgId, membershipId);
  if (!invite) {
    notFound();
  }

  const t = await getTranslations('Invite');

  if (invite.status !== 'invited') {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-col gap-4 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('alreadyResolved')}</p>
      </main>
    );
  }

  const session = await getServerSession();
  const fromPath = `/invite/${orgId}/${membershipId}`;

  if (!session) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('description', { organizationName: invite.organizationName, email: invite.inviteeEmail })}
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild size="sm">
            <Link href={{ pathname: '/login', query: { from: fromPath } }}>{t('signInToAccept')}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={{ pathname: '/signup', query: { from: fromPath } }}>{t('signUpToAccept')}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const { user } = await resolveOrgSessionContext(session);
  const isMatch = user.id === invite.inviteeUserId;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">
        {t('description', { organizationName: invite.organizationName, email: invite.inviteeEmail })}
      </p>
      {isMatch ? (
        <AcceptInviteButton orgId={orgId} membershipId={membershipId} />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-destructive">{t('emailMismatch', { email: invite.inviteeEmail })}</p>
          <SwitchAccountButton fromPath={fromPath} />
        </div>
      )}
    </main>
  );
}
