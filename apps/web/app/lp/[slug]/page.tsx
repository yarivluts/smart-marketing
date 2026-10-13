import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadPublicLanding } from '@/lib/growth-pilot/public';
import { GrowthLandingView } from '@/components/growth-pilot/landing-view';

type PageProps = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = await loadPublicLanding((await params).slug);
  if (!page) return { robots: { index: false, follow: false } };
  // Ad landing pages stay out of search: they repeat the site for one audience and would compete with it.
  return { title: page.content.headline, description: page.content.subheadline, robots: { index: false, follow: false } };
}

/** A published Growth Pilot landing page; anything else is a plain 404. */
export default async function PublicLandingPage({ params }: PageProps): Promise<React.ReactElement> {
  const page = await loadPublicLanding((await params).slug);
  if (!page) notFound();
  return <GrowthLandingView content={page.content} ctaUrl={page.ctaUrl} dir={page.dir} host={page.host} />;
}
