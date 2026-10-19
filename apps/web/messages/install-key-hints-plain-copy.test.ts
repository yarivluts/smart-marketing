import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Messages = typeof en;

function hints(m: Messages): string[] {
  const inst = (m as unknown as { Installation: { noKey: Record<string, string>; missingKey: { secret: { body: string } } } }).Installation;
  return [inst.noKey.publishable, inst.noKey.secret, inst.missingKey.secret.body];
}

describe('install page key hints', () => {
  it.each([
    ['en', en as Messages],
    ['he', he as unknown as Messages],
  ])('%s hints do not show scope names', (_locale, m) => {
    for (const text of hints(m)) expect(text).not.toContain('ingest.write');
  });

  it('en hints point at the page by its sidebar name', () => {
    const [browser, server] = hints(en);
    expect(browser).toContain('Access keys page');
    expect(server).toContain('Access keys page');
    expect(server).not.toContain('Keys page - ');
  });

  it('he hints point at the page by its sidebar name', () => {
    expect(hints(he as unknown as Messages)[0]).toContain('מפתחות הגישה');
    expect(hints(he as unknown as Messages)[1]).toContain('מפתחות הגישה');
  });
});
