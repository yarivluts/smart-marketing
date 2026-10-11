import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Automation' });
  return { title: t('metaTitle') || 'Automation Hub' };
}

/**
 * Automation is meaningless without a project: every proposal, guardrail and audit entry
 * is scoped to one. This route used to render the hub directly with the literal ids
 * `default-org` / `default-project`, which match no organization and no project — so the
 * page showed invented proposals, an invented spend figure, and an Approve button that
 * only mutated local state. Nothing a user did here could reach a real campaign.
 *
 * The real surface is `/orgs/{orgId}/projects/{projectId}/automation`. This route now
 * sends the visitor to the dashboard to choose one, which is also where the command
 * palette's context-free "Automation" entry lands.
 */
export default async function TopLevelAutomationPage({ params }: PageProps): Promise<never> {
  const { locale } = await params;
  setRequestLocale(locale);

  redirect(`/${locale}/dashboard`);
}
