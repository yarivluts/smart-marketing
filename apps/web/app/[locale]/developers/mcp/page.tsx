import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Bot } from 'lucide-react';
import { claudeCodeMcpAdd, curlMcp, mcpEndpoint, mcpHeadlessSample } from '@growthos/shared';
import { developerGuideContext } from '@/lib/developers/context';
import { CodeBlock } from '@/components/developers/code-block';
import { Callout, DocList, DocSection, DocText, RICH } from '@/components/developers/doc-parts';
import { GuidePage, guideMetadata } from '@/components/developers/guide-page';

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps) {
  return guideMetadata((await params).locale, 'mcp');
}

const TOOL_GROUPS = ['toolsRead', 'toolsSetup', 'toolsGrowth', 'toolsAds', 'toolsAutomation'] as const;

export default async function McpPage({ params }: PageProps): Promise<React.ReactElement> {
  setRequestLocale((await params).locale);
  const [t, ctx] = await Promise.all([getTranslations('Developers'), developerGuideContext()]);

  return (
    <GuidePage guide="mcp" icon={Bot}>
      <DocSection id="endpoint" title={t('mcp.endpointTitle')}>
        <DocText>{t.rich('mcp.endpointBody', RICH)}</DocText>
        <CodeBlock label={t('mcp.endpointLabel')} code={mcpEndpoint(ctx)} />
      </DocSection>
      <DocSection id="credentials" title={t('mcp.authTitle')}>
        <DocText>{t.rich('mcp.authBody', RICH)}</DocText>
      </DocSection>
      <DocSection id="claude" title={t('mcp.claudeTitle')}>
        <DocText>{t.rich('mcp.claudeBody', RICH)}</DocText>
      </DocSection>
      <DocSection id="claude-code" title={t('mcp.claudeCodeTitle')}>
        <DocText>{t.rich('mcp.claudeCodeBody', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={claudeCodeMcpAdd(ctx)} />
      </DocSection>
      <DocSection id="http" title={t('mcp.curlTitle')}>
        <DocText>{t.rich('mcp.curlBody', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={curlMcp(ctx, 'tools/list')} />
        <CodeBlock
          label={t('code.terminal')}
          code={curlMcp(ctx, 'tools/call', { name: 'check_installation', arguments: { expect: ['touchpoint', 'signup'] } })}
        />
      </DocSection>
      <DocSection id="headless" title={t('mcp.headlessTitle')}>
        <DocText>{t.rich('mcp.headlessBody', RICH)}</DocText>
        <CodeBlock label={t('code.terminal')} code={'npm install @modelcontextprotocol/sdk'} />
        <CodeBlock label={t('code.javascript')} code={mcpHeadlessSample(ctx)} />
      </DocSection>
      <DocSection id="tools" title={t('mcp.toolsTitle')}>
        <DocList items={TOOL_GROUPS.map((group) => t.rich(`mcp.${group}`, RICH))} />
      </DocSection>
      <DocSection id="test" title={t('mcp.testTitle')}>
        <Callout>{t.rich('mcp.testBody', RICH)}</Callout>
      </DocSection>
    </GuidePage>
  );
}
