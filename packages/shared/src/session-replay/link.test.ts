import { describe, expect, it } from 'vitest';
import { buildSessionReplayLink, SESSION_REPLAY_LANDING_PAGE_PLACEHOLDER } from './link';

const CLARITY_TEMPLATE = `https://clarity.microsoft.com/projects/view/abc123/impressions?Url=${SESSION_REPLAY_LANDING_PAGE_PLACEHOLDER}`;

describe('buildSessionReplayLink', () => {
  it('substitutes the landing page into the template', () => {
    const link = buildSessionReplayLink(CLARITY_TEMPLATE, 'https://example.com/lp-a');
    expect(link).toBe('https://clarity.microsoft.com/projects/view/abc123/impressions?Url=https%3A%2F%2Fexample.com%2Flp-a');
  });

  it("URL-encodes the page so its own query string can't break out of the parameter", () => {
    const link = buildSessionReplayLink(CLARITY_TEMPLATE, 'https://example.com/lp?a=1&b=2');
    expect(link).not.toContain('lp?a=1&b=2');
    expect(link).toContain(encodeURIComponent('https://example.com/lp?a=1&b=2'));
  });

  it('replaces every occurrence of the placeholder', () => {
    const link = buildSessionReplayLink(
      `https://tool.example/?a=${SESSION_REPLAY_LANDING_PAGE_PLACEHOLDER}&b=${SESSION_REPLAY_LANDING_PAGE_PLACEHOLDER}`,
      'https://example.com/x',
    );
    const encoded = encodeURIComponent('https://example.com/x');
    expect(link).toBe(`https://tool.example/?a=${encoded}&b=${encoded}`);
  });

  it('returns a placeholder-less template unchanged (a plain "open the tool" link)', () => {
    expect(buildSessionReplayLink('https://clarity.microsoft.com/projects', 'https://example.com/lp-a')).toBe(
      'https://clarity.microsoft.com/projects',
    );
  });

  it('returns null when no template is configured', () => {
    expect(buildSessionReplayLink(undefined, 'https://example.com/lp-a')).toBeNull();
    expect(buildSessionReplayLink('', 'https://example.com/lp-a')).toBeNull();
    expect(buildSessionReplayLink('   ', 'https://example.com/lp-a')).toBeNull();
  });

  it('rejects non-http(s) schemes — an admin-supplied href is a stored-XSS vector otherwise', () => {
    expect(buildSessionReplayLink('javascript:alert(1)', 'https://example.com/lp-a')).toBeNull();
    expect(buildSessionReplayLink('data:text/html,<script>alert(1)</script>', 'https://example.com/lp-a')).toBeNull();
    expect(buildSessionReplayLink('JavaScript:alert(1)', 'https://example.com/lp-a')).toBeNull();
  });

  it('rejects a template that is not a URL at all', () => {
    expect(buildSessionReplayLink('not a url', 'https://example.com/lp-a')).toBeNull();
  });
});
