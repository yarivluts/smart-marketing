import { describe, expect, it } from 'vitest';
import { buildSessionReplayLink, sessionReplayTemplateFiltersByPage, SESSION_REPLAY_LANDING_PAGE_PLACEHOLDER } from './link';

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

  /**
   * A filtering template plus a blank page used to substitute to a filter for
   * the empty string: a link that opens the tool showing nothing, rendered on a
   * table cell that is itself blank. The board got an empty clickable cell
   * whose only tell was the cursor (KAN-161).
   *
   * A row with no landing page has nothing to watch, so no link is the honest
   * render. The non-filtering case is left alone deliberately — "open my replay
   * tool" is as valid on a row with no page as on one with a page.
   */
  it('returns null for a filtering template when the row has no landing page', () => {
    const filtering = `https://tool.example/?url=${SESSION_REPLAY_LANDING_PAGE_PLACEHOLDER}`;
    expect(buildSessionReplayLink(filtering, '')).toBeNull();
    expect(buildSessionReplayLink(filtering, '   ')).toBeNull();
    // Still linked when there IS a page, so the guard cannot silently disable the feature.
    expect(buildSessionReplayLink(filtering, 'https://example.com/lp-a')).not.toBeNull();
    // A plain link-out is unaffected by the row having no page.
    expect(buildSessionReplayLink('https://clarity.microsoft.com/projects', '')).toBe('https://clarity.microsoft.com/projects');
  });
});

/**
 * Whether a template filters to the row's own page — invisible in the rendered
 * link, since both kinds render as an ordinary anchor on every row while one
 * opens the same unfiltered view every time. The save form and the board
 * tooltip both branch on this so the difference is stated somewhere (KAN-160).
 */
describe('sessionReplayTemplateFiltersByPage', () => {
  it('is true only when the exact placeholder is present', () => {
    expect(sessionReplayTemplateFiltersByPage(`https://tool.example/?url=${SESSION_REPLAY_LANDING_PAGE_PLACEHOLDER}`)).toBe(true);
    expect(sessionReplayTemplateFiltersByPage('https://clarity.microsoft.com/projects')).toBe(false);
    expect(sessionReplayTemplateFiltersByPage(undefined)).toBe(false);
    expect(sessionReplayTemplateFiltersByPage('')).toBe(false);
  });

  /**
   * The typos are the point. Each of these is a valid https URL, saves without
   * complaint, and renders a link on every row — so nothing else in the system
   * distinguishes them from a template that works.
   */
  it.each(['{landingpage}', '{landing-page}', '{LANDING_PAGE}', '{page}'])('treats %s as a template that does not filter', (typo) => {
    expect(sessionReplayTemplateFiltersByPage(`https://tool.example/?url=${typo}`)).toBe(false);
  });
});
