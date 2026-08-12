/** The placeholder a project's session-replay template uses for the landing page it should filter to. */
export const SESSION_REPLAY_LANDING_PAGE_PLACEHOLDER = '{landing_page}';

/**
 * Builds the session-replay deep link for one landing page, or `null` when
 * no usable link can be built (no template configured, or a template that
 * isn't an http(s) URL).
 *
 * The scheme check is the security boundary: this value is admin-supplied
 * free text that ends up in an anchor's `href`, so a `javascript:`
 * (or `data:`) template would be a stored-XSS vector on every board that
 * renders a landing-page row. Only `http`/`https` are allowed through.
 *
 * The landing page is `encodeURIComponent`-ed, so a page URL's own `?`/`&`
 * can't break out of the query parameter the template puts it in. A
 * template without the placeholder is returned as-is — a plain "open my
 * replay tool" link is still more useful than nothing.
 */
export function buildSessionReplayLink(template: string | undefined, landingPage: string): string | null {
  const trimmed = template?.trim();
  if (!trimmed) {
    return null;
  }

  const url = trimmed.split(SESSION_REPLAY_LANDING_PAGE_PLACEHOLDER).join(encodeURIComponent(landingPage));

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  return url;
}
