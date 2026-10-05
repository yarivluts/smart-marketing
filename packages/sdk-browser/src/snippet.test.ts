import { describe, expect, it } from 'vitest';
import { installSnippet } from './snippet';

describe('install snippet', () => {
  it('loads the script asynchronously and queues calls made before it arrives', () => {
    localStorage.clear();
    const snippet = installSnippet({
      key: 'gos_pk_live_abc',
      api: 'https://api.test/',
      scriptUrl: 'https://app.test/sdk/v1/growthos.js',
    });
    expect(snippet).toContain('GrowthOS.init({"key":"gos_pk_live_abc","api":"https://api.test"});');
    // Execute the inline part the way a browser would (the script itself does not load in jsdom).
    const body = snippet.split('\n').slice(2, -1).join('\n');
    delete (window as unknown as { GrowthOS?: unknown }).GrowthOS;
    new Function(body)();
    const stub = (
      window as unknown as {
        GrowthOS: { q: [string, IArguments][]; track: (...args: unknown[]) => void };
      }
    ).GrowthOS;
    stub.track('cta_click', { cta: 'hero' });
    expect(stub.q.map(([method, args]) => [method, Array.from(args)])).toEqual([
      ['init', [{ key: 'gos_pk_live_abc', api: 'https://api.test' }]],
      ['track', ['cta_click', { cta: 'hero' }]],
    ]);
    const script = document.head.querySelector(
      'script[src="https://app.test/sdk/v1/growthos.js"]',
    ) as HTMLScriptElement;
    expect(script.async).toBe(true);
  });

  it('cannot be broken out of by a value that closes the script tag', () => {
    const snippet = installSnippet({
      key: 'gos_pk_live_</script><script>alert(1)',
      api: 'https://api.test',
      scriptUrl: 'https://app.test/s.js',
      pageViews: true,
    });
    expect(snippet.match(/<\/script>/g)).toHaveLength(1);
    expect(snippet).toContain('"pageViews":true');
  });
});
