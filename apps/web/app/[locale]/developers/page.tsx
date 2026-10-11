import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, BookOpen, Bot, Braces, FlaskConical, Globe, Rocket, Server, type LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { DEVELOPER_GUIDES, developerGuideHref } from '@/lib/developers/guides';
import { Callout, DocSection, DocText, RICH } from '@/components/developers/doc-parts';
import { GuidePage, guideMetadata } from '@/components/developers/guide-page';

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps) {
  return guideMetadata((await params).locale, 'overview');
}

const CARD_ICONS: Record<string, LucideIcon> = { Rocket, Globe, Server, Braces, Bot, FlaskConical };
const CONCEPTS = ['environments', 'keys', 'schemas', 'identity', 'idempotency'] as const;

export default async function DevelopersOverviewPage({ params }: PageProps): Promise<React.ReactElement> {
  setRequestLocale((await params).locale);
  const t = await getTranslations('Developers');
  const guides = DEVELOPER_GUIDES.filter((guide) => guide.key !== 'overview');

  return (
    <GuidePage guide="overview" icon={BookOpen}>
      <Callout>{t.rich('overview.testedNote', RICH)}</Callout>
      <DocSection id="paths" title={t('overview.pathsTitle')}>
        <div className="grid gap-pp-md sm:grid-cols-2 xl:grid-cols-3" data-testid="developer-paths">
          {guides.map((guide) => {
            const Icon = CARD_ICONS[guide.icon];
            return (
              <Link
                key={guide.key}
                href={developerGuideHref(guide)}
                className="group flex flex-col gap-2 rounded-2xl bg-pp-surface-container-lowest p-pp-lg shadow-pp-candy transition-shadow hover:shadow-pp-candy-hover"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pp-primary-fixed text-pp-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="font-pp-display text-pp-headline-md text-pp-on-surface">{t(`nav.${guide.key}`)}</span>
                <span className="text-pp-body-md text-pp-on-surface-variant">{t(`overview.cards.${guide.key}`)}</span>
                <span className="mt-auto inline-flex items-center gap-1 text-pp-label-md text-primary">
                  {t('common.read')}
                  <ArrowLeft className="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </DocSection>
      <DocSection id="concepts" title={t('overview.conceptsTitle')}>
        <dl className="grid gap-pp-md md:grid-cols-2">
          {CONCEPTS.map((concept) => (
            <div key={concept} className="rounded-2xl bg-pp-surface-container-lowest p-pp-lg shadow-pp-candy">
              <dt className="font-pp-display text-pp-headline-md text-pp-on-surface">{t(`overview.concepts.${concept}.title`)}</dt>
              <dd className="mt-1">
                <DocText className="text-pp-body-md">{t.rich(`overview.concepts.${concept}.body`, RICH)}</DocText>
              </dd>
            </div>
          ))}
        </dl>
      </DocSection>
    </GuidePage>
  );
}
