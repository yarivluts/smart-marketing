import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Globe } from 'lucide-react';
import { installSnippet } from '@growthos/browser';
import {
  GUIDE_BROWSER_KEY_PLACEHOLDER,
  browserConsentSample,
  browserConsoleVerify,
  browserInstall,
  browserNpmSample,
  relaySample,
} from '@growthos/shared';
import { developerGuideContext } from '@/lib/developers/context';
import { CodeBlock } from '@/components/developers/code-block';
import { Callout, DocList, DocSection, DocText, RICH } from '@/components/developers/doc-parts';
import { GuidePage, guideMetadata } from '@/components/developers/guide-page';

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps) {
  return guideMetadata((await params).locale, 'clientSide');
}

const API_ITEMS = ['apiTrack', 'apiIdentify', 'apiReset', 'apiAnon', 'apiPage', 'apiFlush'] as const;

export default async function ClientSidePage({ params }: PageProps): Promise<React.ReactElement> {
  setRequestLocale((await params).locale);
  const [t, ctx] = await Promise.all([getTranslations('Developers'), developerGuideContext()]);
  const snippet = installSnippet({ key: GUIDE_BROWSER_KEY_PLACEHOLDER, api: ctx.apiBase, scriptUrl: `${ctx.appBase}/sdk/v1/growthos.js` });

  return (
    <GuidePage guide="clientSide" icon={Globe}>
      <DocSection id="keys" title={t('clientSide.keyTitle')}>
        <DocText>{t.rich('clientSide.keyBody', RICH)}</DocText>
        <Callout tone="warning">{t.rich('clientSide.secretWarning', RICH)}</Callout>
      </DocSection>
      <DocSection id="snippet" title={t('clientSide.snippetTitle')}>
        <DocText>{t.rich('clientSide.snippetBody', RICH)}</DocText>
        <CodeBlock label={t('code.html')} code={snippet} />
      </DocSection>
      <DocSection id="npm" title={t('clientSide.npmTitle')}>
        <DocText>{t.rich('clientSide.npmBody', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={browserInstall(ctx)} />
        <CodeBlock label={t('code.typescript')} code={browserNpmSample(ctx)} />
      </DocSection>
      <DocSection id="calls" title={t('clientSide.apiTitle')}>
        <DocList items={API_ITEMS.map((item) => t.rich(`clientSide.${item}`, RICH))} />
      </DocSection>
      <DocSection id="consent" title={t('clientSide.consentTitle')}>
        <DocText>{t.rich('clientSide.consentBody', RICH)}</DocText>
        <CodeBlock label={t('code.typescript')} code={browserConsentSample(ctx)} />
      </DocSection>
      <DocSection id="relay" title={t('clientSide.relayTitle')}>
        <DocText>{t.rich('clientSide.relayBody', RICH)}</DocText>
        <CodeBlock label={t('code.typescript')} code={relaySample(ctx)} />
      </DocSection>
      <DocSection id="verify" title={t('clientSide.verifyTitle')}>
        <DocText>{t.rich('clientSide.verifyBody', RICH)}</DocText>
        <CodeBlock label={t('code.console')} code={browserConsoleVerify()} />
      </DocSection>
    </GuidePage>
  );
}
