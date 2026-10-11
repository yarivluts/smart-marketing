/** The Developers area's guides, in reading order. `key` names the guide's translation namespace. */
export const DEVELOPER_GUIDES = [
  { slug: '', key: 'overview', icon: 'BookOpen' },
  { slug: 'quick-start', key: 'quickStart', icon: 'Rocket' },
  { slug: 'client-side', key: 'clientSide', icon: 'Globe' },
  { slug: 'server-side', key: 'serverSide', icon: 'Server' },
  { slug: 'api', key: 'api', icon: 'Braces' },
  { slug: 'mcp', key: 'mcp', icon: 'Bot' },
  { slug: 'testing', key: 'testing', icon: 'FlaskConical' },
] as const;

export type DeveloperGuide = (typeof DEVELOPER_GUIDES)[number];
export type DeveloperGuideKey = DeveloperGuide['key'];

export function developerGuideHref(guide: Pick<DeveloperGuide, 'slug'>): string {
  return guide.slug ? `/developers/${guide.slug}` : '/developers';
}

/** The guides before and after `key`, for the previous / next links at the end of a page. */
export function adjacentGuides(key: DeveloperGuideKey): { previous?: DeveloperGuide; next?: DeveloperGuide } {
  const index = DEVELOPER_GUIDES.findIndex((guide) => guide.key === key);
  return {
    previous: index > 0 ? DEVELOPER_GUIDES[index - 1] : undefined,
    next: index >= 0 && index < DEVELOPER_GUIDES.length - 1 ? DEVELOPER_GUIDES[index + 1] : undefined,
  };
}
