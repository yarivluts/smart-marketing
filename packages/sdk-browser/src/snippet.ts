/**
 * The install snippet for a website: a tiny loader that records calls until the SDK script
 * arrives (so `init` and early `track` calls are never lost), then loads the script
 * asynchronously - it never blocks the page. Paste it once in the <head> of every page.
 */
export interface InstallSnippetOptions {
  /** The publishable key (gos_pk_live_... / gos_pk_test_...). */
  key: string;
  /** The GrowthOS API, e.g. https://api.growthos.example (without /v1). */
  api: string;
  /** Where the SDK script is served, e.g. https://app.growthos.example/sdk/v1/growthos.js. */
  scriptUrl: string;
  /** Also send page_view on load and on in-app navigation (register a page_view schema first). */
  pageViews?: boolean;
}

const STUB_METHODS = ['init', 'track', 'page', 'identify', 'reset', 'consent', 'flush', 'verify'];

export function installSnippet(options: InstallSnippetOptions): string {
  const init: Record<string, unknown> = { key: options.key, api: options.api.replace(/\/+$/, '') };
  if (options.pageViews) init.pageViews = true;
  // JSON.stringify quotes and escapes every value; "<" is escaped too so no value can close the <script> tag.
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  return [
    '<!-- GrowthOS -->',
    '<script>',
    `  !function(w,d){if(w.GrowthOS)return;var g=w.GrowthOS={q:[]};${json(STUB_METHODS)}.forEach(function(m){g[m]=function(){g.q.push([m,arguments])}});var s=d.createElement("script");s.async=true;s.src=${json(options.scriptUrl)};d.head.appendChild(s)}(window,document);`,
    `  GrowthOS.init(${json(init)});`,
    '</script>',
  ].join('\n');
}
