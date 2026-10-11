import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FlaskConical } from 'lucide-react';
import { curlVerify } from '@growthos/shared';
import { developerGuideContext } from '@/lib/developers/context';
import { CodeBlock } from '@/components/developers/code-block';
import { Callout, DocList, DocSection, DocText, RICH } from '@/components/developers/doc-parts';
import { GuidePage, guideMetadata } from '@/components/developers/guide-page';

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps) {
  return guideMetadata((await params).locale, 'testing');
}

const LOOP_STEPS = ['loop1', 'loop2', 'loop3', 'loop4'] as const;

export default async function TestingPage({ params }: PageProps): Promise<React.ReactElement> {
  setRequestLocale((await params).locale);
  const [t, ctx] = await Promise.all([getTranslations('Developers'), developerGuideContext()]);

  return (
    <GuidePage guide="testing" icon={FlaskConical}>
      <DocSection id="environments" title={t('testing.envTitle')}>
        <DocText>{t.rich('testing.envBody', RICH)}</DocText>
        <div className="overflow-x-auto rounded-2xl bg-pp-surface-container-lowest shadow-pp-candy">
          <table className="w-full min-w-[520px] text-pp-body-md">
            <thead className="bg-pp-surface-container-low text-pp-label-sm uppercase tracking-wider text-pp-outline">
              <tr>
                <th scope="col" className="px-4 py-3 text-start">{t('testing.colEnvironment')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('testing.colServerKey')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('testing.colBrowserKey')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('testing.colUse')}</th>
              </tr>
            </thead>
            <tbody>
              {(['dev', 'staging', 'prod'] as const).map((environment) => (
                <tr key={environment} className="border-t border-pp-outline-variant/30">
                  <td className="px-4 py-3 font-semibold">{t(`testing.env.${environment}`)}</td>
                  <td className="px-4 py-3" dir="ltr">
                    <code className="font-mono">{environment === 'prod' ? 'gos_live_' : 'gos_test_'}</code>
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    <code className="font-mono">{environment === 'prod' ? 'gos_pk_live_' : 'gos_pk_test_'}</code>
                  </td>
                  <td className="px-4 py-3 text-pp-on-surface-variant">{t(`testing.use.${environment}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>
      <DocSection id="picker" title={t('testing.pickerTitle')}>
        <DocText>{t.rich('testing.pickerBody', RICH)}</DocText>
      </DocSection>
      <DocSection id="loop" title={t('testing.loopTitle')}>
        <DocList ordered items={LOOP_STEPS.map((step) => t.rich(`testing.${step}`, RICH))} />
        <CodeBlock label={t('code.terminal')} code={curlVerify(ctx)} />
      </DocSection>
      <DocSection id="quarantine" title={t('testing.quarantineTitle')}>
        <DocText>{t.rich('testing.quarantineBody', RICH)}</DocText>
      </DocSection>
      <DocSection id="live" title={t('testing.liveTitle')}>
        <Callout>{t.rich('testing.liveBody', RICH)}</Callout>
      </DocSection>
    </GuidePage>
  );
}
