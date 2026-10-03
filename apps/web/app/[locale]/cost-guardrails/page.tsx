import { redirectToFirstProject } from '@/lib/orgs/redirect-project';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function CostGuardrailsShortcutPage({ params }: PageProps) {
  const { locale } = await params;
  return redirectToFirstProject(locale, 'cost-guardrails');
}
