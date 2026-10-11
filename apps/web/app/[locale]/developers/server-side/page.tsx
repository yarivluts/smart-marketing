import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Server } from 'lucide-react';
import { nodeInstall, nodeServerSample, nodeVerifyCli } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { developerGuideContext } from '@/lib/developers/context';
import { CodeBlock } from '@/components/developers/code-block';
import { DocSection, DocText, RICH } from '@/components/developers/doc-parts';
import { GuidePage, guideMetadata } from '@/components/developers/guide-page';

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps) {
  return guideMetadata((await params).locale, 'serverSide');
}

export default async function ServerSidePage({ params }: PageProps): Promise<React.ReactElement> {
  setRequestLocale((await params).locale);
  const [t, ctx] = await Promise.all([getTranslations('Developers'), developerGuideContext()]);

  return (
    <GuidePage guide="serverSide" icon={Server}>
      <DocSection id="install" title={t('serverSide.installTitle')}>
        <DocText>{t.rich('serverSide.installBody', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={nodeInstall(ctx)} />
      </DocSection>
      <DocSection id="send" title={t('serverSide.exampleTitle')}>
        <DocText>{t.rich('serverSide.exampleBody', RICH)}</DocText>
        <CodeBlock label={t('code.javascript')} code={nodeServerSample(ctx)} />
      </DocSection>
      <DocSection id="results" title={t('serverSide.resultsTitle')}>
        <DocText>{t.rich('serverSide.resultsBody', RICH)}</DocText>
      </DocSection>
      <DocSection id="ids" title={t('serverSide.idTitle')}>
        <DocText>{t.rich('serverSide.idBody', RICH)}</DocText>
      </DocSection>
      <DocSection id="cli" title={t('serverSide.cliTitle')}>
        <DocText>{t.rich('serverSide.cliBody', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={nodeVerifyCli(ctx)} />
      </DocSection>
      <DocSection id="other-languages" title={t('serverSide.otherTitle')}>
        <DocText>{t.rich('serverSide.otherBody', RICH)}</DocText>
        <Link href="/developers/api" className="w-fit text-pp-label-md font-semibold text-primary hover:underline">
          {t('nav.api')}
        </Link>
      </DocSection>
    </GuidePage>
  );
}
