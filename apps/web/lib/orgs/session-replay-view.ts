/** Which replay tool a project's deep-link template points at, read from the URL's host - for the settings page's summary. */
export type SessionReplayTool = 'clarity' | 'hotjar' | 'fullstory' | 'other';

export const LANDING_PAGE_PLACEHOLDER = '{landing_page}';

export interface SessionReplayTemplateSummary {
  tool: SessionReplayTool | null;
  /** Whether each landing-page row gets its own filtered link, or all rows share one unfiltered page. */
  filtersByPage: boolean;
}

export function summarizeSessionReplayTemplate(template: string | undefined | null): SessionReplayTemplateSummary {
  const trimmed = template?.trim() ?? '';
  if (trimmed.length === 0) {
    return { tool: null, filtersByPage: false };
  }
  let host = '';
  try {
    host = new URL(trimmed.replace(LANDING_PAGE_PLACEHOLDER, 'x')).hostname.toLowerCase();
  } catch {
    host = '';
  }
  const tool: SessionReplayTool = host.endsWith('clarity.microsoft.com') ? 'clarity' : host.endsWith('hotjar.com') ? 'hotjar' : host.endsWith('fullstory.com') ? 'fullstory' : 'other';
  return { tool, filtersByPage: trimmed.includes(LANDING_PAGE_PLACEHOLDER) };
}
