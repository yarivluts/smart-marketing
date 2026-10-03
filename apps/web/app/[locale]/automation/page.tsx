import { redirectToFirstProject } from '@/lib/orgs/redirect-project';

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

/**
 * Shortcut to the signed-in user's first project's Automation hub — same
 * pattern as the other top-level shortcuts (`/funnel`, `/campaigns`, …).
 *
 * Previously this rendered `AutomationHub` directly with hardcoded
 * `default-org` / `default-project` IDs and no session check, so every API
 * call it made targeted an org/project that doesn't exist.
 */
export default async function AutomationShortcutPage({ params }: PageProps) {
  const { locale } = await params;
  return redirectToFirstProject(locale, 'automation');
}
