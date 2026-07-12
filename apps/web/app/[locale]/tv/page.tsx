import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TvApp } from '@/components/tv/tv-app';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'TvMode' });
  return { title: t('metaTitle') };
}

/**
 * War-room TV mode (KAN-67, E12.3, plan `10 §2.3`): the URL a TV/kiosk
 * browser opens directly, with no GrowthOS login of its own — deliberately
 * outside `/orgs/...` (no session, no org context exists on this page until
 * an admin claims the pairing code it displays; see `TvApp`'s own doc
 * comment for the full state machine and `tv-viewer-auth.ts` for how the
 * session-less API routes it talks to authenticate it instead).
 */
export default async function TvModePage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  return <TvApp />;
}
