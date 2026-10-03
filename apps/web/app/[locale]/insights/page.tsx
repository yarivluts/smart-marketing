import { redirectToFirstProject } from '@/lib/orgs/redirect-project';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function InsightsShortcutPage({ params }: PageProps) {
  const { locale } = await params;
  return redirectToFirstProject(locale, 'insights');
}
