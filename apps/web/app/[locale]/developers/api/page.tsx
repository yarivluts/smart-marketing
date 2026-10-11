import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Braces } from 'lucide-react';
import { curlBatchStatus, curlContract, curlIngest, curlMetrics, curlRegisterMetric, sampleIngestResponse } from '@growthos/shared';
import { developerGuideContext } from '@/lib/developers/context';
import { CodeBlock } from '@/components/developers/code-block';
import { Callout, DocSection, DocText, InlineCode, RICH } from '@/components/developers/doc-parts';
import { GuidePage, guideMetadata } from '@/components/developers/guide-page';

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps) {
  return guideMetadata((await params).locale, 'api');
}

/** Every public endpoint, with the key scope it needs. */
const ENDPOINTS = [
  { method: 'POST', path: '/v1/ingest/events', scope: 'ingest.write', key: 'events' },
  { method: 'POST', path: '/v1/ingest/entities', scope: 'ingest.write', key: 'entities' },
  { method: 'POST', path: '/v1/ingest/measures', scope: 'ingest.write', key: 'measures' },
  { method: 'POST', path: '/v1/ingest/{kind}/validate', scope: 'ingest.write', key: 'validate' },
  { method: 'GET', path: '/v1/ingest/batches/{batch_id}', scope: 'ingest.write', key: 'batch' },
  { method: 'GET', path: '/v1/ingest/verify?expect=a,b', scope: 'ingest.write', key: 'verify' },
  { method: 'GET', path: '/v1/ingest/contract', scope: '-', key: 'contract' },
  { method: 'GET', path: '/v1/metrics', scope: 'metrics.write', key: 'metrics' },
  { method: 'POST', path: '/v1/metrics/query', scope: 'metrics.write', key: 'metricsQuery' },
  { method: 'POST', path: '/v1/mcp', scope: 'mcp.read', key: 'mcp' },
] as const;

export default async function ApiPage({ params }: PageProps): Promise<React.ReactElement> {
  setRequestLocale((await params).locale);
  const [t, ctx] = await Promise.all([getTranslations('Developers'), developerGuideContext()]);

  return (
    <GuidePage guide="api" icon={Braces}>
      <DocSection id="auth" title={t('api.authTitle')}>
        <DocText>{t.rich('api.authBody', RICH)}</DocText>
        <CodeBlock label={t('api.baseUrl')} code={ctx.apiBase} />
      </DocSection>
      <DocSection id="endpoints" title={t('api.endpointsTitle')}>
        <div className="overflow-x-auto rounded-2xl bg-pp-surface-container-lowest shadow-pp-candy">
          <table className="w-full min-w-[640px] text-start text-pp-body-md">
            <thead className="bg-pp-surface-container-low text-pp-label-sm uppercase tracking-wider text-pp-outline">
              <tr>
                <th scope="col" className="px-4 py-3 text-start">{t('api.colEndpoint')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('api.colScope')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('api.colWhat')}</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((endpoint) => (
                <tr key={endpoint.path} className="border-t border-pp-outline-variant/30 align-top">
                  <td className="px-4 py-3">
                    <InlineCode>{`${endpoint.method} ${endpoint.path}`}</InlineCode>
                  </td>
                  <td className="px-4 py-3">{endpoint.scope === '-' ? t('api.noKey') : <InlineCode>{endpoint.scope}</InlineCode>}</td>
                  <td className="px-4 py-3 text-pp-on-surface-variant">{t(`api.endpoints.${endpoint.key}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>
      <DocSection id="events" title={t('api.eventsTitle')}>
        <DocText>{t.rich('api.eventsBody', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={curlIngest(ctx, 'events')} />
      </DocSection>
      <DocSection id="entities" title={t('api.entitiesTitle')}>
        <DocText>{t.rich('api.entitiesBody', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={curlIngest(ctx, 'entities')} />
      </DocSection>
      <DocSection id="measures" title={t('api.measuresTitle')}>
        <DocText>{t.rich('api.measuresBody', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={curlIngest(ctx, 'measures')} />
      </DocSection>
      <DocSection id="responses" title={t('api.responseTitle')}>
        <DocText>{t.rich('api.responseBody', RICH)}</DocText>
        <CodeBlock label={t('code.json')} code={sampleIngestResponse()} />
        <CodeBlock label={t('code.terminal')} code={curlBatchStatus(ctx)} />
      </DocSection>
      <DocSection id="metrics" title={t('api.metricsTitle')}>
        <DocText>{t.rich('api.metricsBody', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={curlRegisterMetric(ctx)} />
        <CodeBlock label={t('code.terminal')} code={curlMetrics(ctx)} />
      </DocSection>
      <DocSection id="contract" title={t('api.contractTitle')}>
        <DocText>{t.rich('api.contractBody', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={curlContract(ctx)} />
      </DocSection>
      <DocSection id="errors" title={t('api.errorsTitle')}>
        <Callout>{t.rich('api.errorsBody', RICH)}</Callout>
      </DocSection>
    </GuidePage>
  );
}
