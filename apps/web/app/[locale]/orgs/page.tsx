import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'OrgsPage' });
  return { title: t('title') };
}

/** Org switcher's list view (KAN-25): every org the user belongs to, plus any pending invites waiting on them. */
export default async function OrgsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs`);
  }

  const { memberships } = await resolveOrgSessionContext(session);
  const active = memberships.filter((membership) => membership.status !== 'invited');
  const pending = memberships.filter((membership) => membership.status === 'invited');
  const t = await getTranslations('OrgsPage');

  return (
    <main className="container mx-auto flex max-w-2xl flex-col gap-8 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <Button asChild size="sm">
          <Link href="/orgs/new">{t('createOrganization')}</Link>
        </Button>
      </div>

      {active.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((membership) => (
            <li
              key={membership.organizationId}
              className="flex items-center justify-between rounded-md border border-input p-4"
            >
              <div>
                <p className="font-medium">{membership.organizationName}</p>
                <p className="text-sm text-muted-foreground">{t('roleLabel', { role: membership.role })}</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/orgs/${membership.organizationId}`}>{t('open')}</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('pendingInvites')}</h2>
          <ul className="flex flex-col gap-3">
            {pending.map((membership) => (
              <li
                key={membership.membershipId}
                className="flex items-center justify-between rounded-md border border-dashed border-input p-4"
              >
                <div>
                  <p className="font-medium">{membership.organizationName}</p>
                  <p className="text-sm text-muted-foreground">{t('roleLabel', { role: membership.role })}</p>
                </div>
                <Button asChild size="sm">
                  <Link href={`/invite/${membership.organizationId}/${membership.membershipId}`}>
                    {t('viewInvite')}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
