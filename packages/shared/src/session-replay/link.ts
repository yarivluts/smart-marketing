/** The placeholder a project's session-replay template uses for the landing page it should filter to. */
export const SESSION_REPLAY_LANDING_PAGE_PLACEHOLDER = '{landing_page}';

/**
 * Whether a template actually filters to the landing page it is rendered for.
 *
 * A template without the placeholder is still a usable link — it opens the
 * replay tool — but it opens the *same* page for every row. That difference is
 * invisible in the rendered link and must therefore be stated: the admin form
 * warns on save, and the board picks a tooltip that does not promise a
 * page-specific recording (KAN-160).
 *
 * A typo is the common way to land here (`{landingpage}`, `{landing-page}`),
 * and a typo'd template passes every other check there is: it is a valid
 * https URL, it saves, and it renders links on every row.
 */
export function sessionReplayTemplateFiltersByPage(template: string | undefined): boolean {
  return (template ?? '').includes(SESSION_REPLAY_LANDING_PAGE_PLACEHOLDER);
}

/**
 * Builds the session-replay deep link for one landing page, or `null` when
 * no usable link can be built (no template configured, a template that isn't
 * an http(s) URL, or a page-filtering template with no page to filter to).
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

  // A page-filtering template with a blank page would substitute to a filter for
  // the empty string — a link that opens the tool showing nothing, rendered on a
  // table cell that is itself blank. So the board got an empty clickable cell
  // whose only hint that it was a link was the cursor (KAN-161). A row whose
  // `landing_page` is null is a row with no page to watch; the honest render is
  // no link at all.
  //
  // Only when the template filters: a plain "open my replay tool" template is
  // just as valid on a row with no page as on one with a page.
  if (sessionReplayTemplateFiltersByPage(trimmed) && landingPage.trim().length === 0) {
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
