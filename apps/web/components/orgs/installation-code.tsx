'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { installSnippet } from '@growthos/browser';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface InstallationCodeProps {
  /** The GrowthOS API, without /v1. */
  apiBase: string;
  /** Display prefixes of the environment's active browser keys (the full key is only shown at mint). */
  browserKeyPrefix: string | null;
  serverKeyPrefix: string | null;
}

type Tab = 'website' | 'browser_npm' | 'node' | 'relay' | 'check';

/**
 * Copy-ready code for every way a site connects: the website snippet, the browser package, the
 * Node server SDK, a same-origin relay for strict CSPs, and the command-line installation check -
 * with this deployment's addresses filled in. The SDKs are served by this app itself.
 */
export function InstallationCode({
  apiBase,
  browserKeyPrefix,
  serverKeyPrefix,
}: InstallationCodeProps): React.ReactElement {
  const t = useTranslations('Installation');
  const [tab, setTab] = useState<Tab>('website');
  const [copied, setCopied] = useState<Tab | null>(null);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const browserKey = browserKeyPrefix ? `${browserKeyPrefix}...` : 'gos_pk_live_...';
  const serverKey = serverKeyPrefix ? `${serverKeyPrefix}...` : 'gos_live_...';

  const code = useMemo<Record<Tab, string>>(
    () => ({
      website: installSnippet({
        key: browserKey,
        api: apiBase,
        scriptUrl: `${origin}/sdk/v1/growthos.js`,
      }),
      browser_npm: [
        `npm install ${origin}/sdk/v1/growthos-browser.tgz`,
        '',
        "import { init, track, identify, getAnonId } from '@growthos/browser';",
        '',
        `init({ key: '${browserKey}', api: '${apiBase}' });`,
        "track('cta_click', { cta: 'hero_signup' });",
        'identify(user.id); // after signup / login',
        'const anonId = getAnonId(); // send it to your server with the signup',
      ].join('\n'),
      node: [
        `npm install ${origin}/sdk/v1/growthos-node.tgz`,
        '',
        "import { GrowthOS, eventId } from '@growthos/node';",
        '',
        `const growthos = new GrowthOS({ apiKey: process.env.GROWTHOS_API_KEY, baseUrl: '${apiBase}' });`,
        '',
        'growthos.track({',
        "  event: 'signup',",
        "  eventId: eventId('signup', user.id), // stable: a retry is a duplicate, not a second signup",
        '  customerId: user.id,',
        "  anonId, // from the browser SDK - credits the signup to the visit's campaign",
        "  properties: { plan: 'free' },",
        '});',
        "growthos.customer(user.id, { plan: 'free' }); // the WHOLE row, every time",
        '',
        'await growthos.shutdown(); // before the process / function ends',
      ].join('\n'),
      relay: [
        '// Next.js app/api/growth/route.ts - for a Content-Security-Policy that only allows your own origin',
        "import { createRelayHandler } from '@growthos/node';",
        '',
        'export const POST = createRelayHandler({',
        '  apiKey: process.env.GROWTHOS_API_KEY,',
        `  baseUrl: '${apiBase}',`,
        "  allowedEvents: ['touchpoint', 'page_view', 'cta_click'],",
        '});',
        '',
        "// and in the page: GrowthOS.init({ endpoint: '/api/growth' })",
      ].join('\n'),
      check: [
        `GROWTHOS_API_KEY=${serverKey} npx growthos verify --base-url ${apiBase} --expect touchpoint,signup,customer`,
        '',
        '// in the browser console on your site:',
        "GrowthOS.verify(['touchpoint', 'cta_click'])",
      ].join('\n'),
    }),
    [apiBase, browserKey, serverKey, origin],
  );

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code[tab]);
      setCopied(tab);
    } catch {
      setCopied(null);
    }
  }

  const tabs: Tab[] = ['website', 'browser_npm', 'node', 'relay', 'check'];
  return (
    <section className="flex flex-col gap-3" data-testid="installation-code">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('codeTitle')}>
        {tabs.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={tab === entry}
            onClick={() => setTab(entry)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium',
              tab === entry
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {t(`tabs.${entry}`)}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t(`tabHints.${tab}`)}</p>
      <pre className="max-h-96 overflow-auto rounded-xl bg-muted/60 p-4 text-xs" dir="ltr">
        <code>{code[tab]}</code>
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          {copied === tab ? t('copied') : t('copy')}
        </Button>
        {(tab === 'website' || tab === 'browser_npm') && browserKeyPrefix ? (
          <span className="text-xs text-muted-foreground">{t('fullKeyNote')}</span>
        ) : null}
      </div>
    </section>
  );
}
