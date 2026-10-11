import { redirect } from 'next/navigation';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export default async function ProjectRootPage({ params }: PageProps): Promise<never> {
  const { locale, orgId, projectId } = await params;
  redirect(`/${locale}/orgs/${orgId}/projects/${projectId}/campaigns`);
}
