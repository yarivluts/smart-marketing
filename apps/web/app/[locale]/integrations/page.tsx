import { redirectToFirstProject } from '@/lib/orgs/redirect-project';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function IntegrationsShortcutPage({ params }: PageProps) {
  const { locale } = await params;
  return redirectToFirstProject(locale, 'integrations');
}
