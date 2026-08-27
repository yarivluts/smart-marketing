import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { getOrganization } from '@/lib/orgs/queries';
import { OrganizationSettingsForm } from '@/components/orgs/organization-settings-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'OrganizationSettings' });
  return { title: t('metaTitle') };
}

/**
 * Where an org owner corrects the org's own `name`/`slug`/`billing_email`
 * once it's been created — see `updateOrganization`'s doc comment for why
 * this closes a gap that's existed since KAN-25.
 *
 * Gated on `billing.manage` (org-owner-only), not `project.manage` — see
 * `updateOrganization`'s own doc comment for why this is the first real
 * route that permission gates.
 */
export default async function OrganizationSettingsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fsettings`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'billing.manage', { orgId })) {
    notFound();
  }

  const organization = await getOrganization(orgId);
  if (!organization) {
    notFound();
  }

  const t = await getTranslations('OrganizationSettings');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { orgName: organization.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('intro')}</p>
      </div>

      <section>
        <OrganizationSettingsForm
          orgId={orgId}
          initialName={organization.name}
          initialSlug={organization.slug ?? ''}
          initialBillingEmail={organization.billing_email ?? ''}
        />
      </section>
    </main>
  );
}
