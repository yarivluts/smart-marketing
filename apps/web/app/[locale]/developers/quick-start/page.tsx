import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Rocket } from 'lucide-react';
import { curlApplySchemaManifest, curlIngest, curlVerify, schemaManifestJson } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { developerGuideContext } from '@/lib/developers/context';
import { CodeBlock } from '@/components/developers/code-block';
import { Callout, DocSection, DocText, RICH } from '@/components/developers/doc-parts';
import { GuidePage, guideMetadata } from '@/components/developers/guide-page';

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps) {
  return guideMetadata((await params).locale, 'quickStart');
}

export default async function QuickStartPage({ params }: PageProps): Promise<React.ReactElement> {
  setRequestLocale((await params).locale);
  const [t, ctx] = await Promise.all([getTranslations('Developers'), developerGuideContext()]);

  return (
    <GuidePage guide="quickStart" icon={Rocket}>
      <DocSection id="keys" title={t('quickStart.step1Title')}>
        <DocText>{t.rich('quickStart.step1Body', RICH)}</DocText>
        <DocText>{t.rich('quickStart.step1Env', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={'export GROWTHOS_API_KEY=gos_test_...'} />
        <Link href="/dashboard" className="w-fit text-pp-label-md font-semibold text-primary hover:underline">
          {t('quickStart.step1Cta')}
        </Link>
      </DocSection>
      <DocSection id="schemas" title={t('quickStart.step2Title')}>
        <DocText>{t.rich('quickStart.step2Body', RICH)}</DocText>
        <CodeBlock label={t('code.json')} code={schemaManifestJson()} />
        <CodeBlock label={t('code.terminal')} code={curlApplySchemaManifest(ctx)} />
      </DocSection>
      <DocSection id="first-event" title={t('quickStart.step3Title')}>
        <DocText>{t.rich('quickStart.step3Body', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={curlIngest(ctx, 'events')} />
      </DocSection>
      <DocSection id="sdks" title={t('quickStart.step4Title')}>
        <DocText>{t.rich('quickStart.step4Body', RICH)}</DocText>
        <div className="flex flex-wrap gap-pp-sm">
          <Link href="/developers/client-side" className="rounded-full bg-pp-primary-fixed px-4 py-2 text-pp-label-md text-pp-on-primary-fixed hover:bg-pp-primary-fixed-dim/60">
            {t('nav.clientSide')}
          </Link>
          <Link href="/developers/server-side" className="rounded-full bg-pp-primary-fixed px-4 py-2 text-pp-label-md text-pp-on-primary-fixed hover:bg-pp-primary-fixed-dim/60">
            {t('nav.serverSide')}
          </Link>
        </div>
      </DocSection>
      <DocSection id="verify" title={t('quickStart.step5Title')}>
        <DocText>{t.rich('quickStart.step5Body', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={curlVerify(ctx)} />
      </DocSection>
      <DocSection id="live" title={t('quickStart.liveTitle')}>
        <Callout>{t.rich('quickStart.liveBody', RICH)}</Callout>
      </DocSection>
    </GuidePage>
  );
}
