/**
 * Where a person starts after signing in: the project they opened last if they can still open it,
 * otherwise their only project, otherwise the overview where they pick one.
 */
export function chooseStartPath(
  projects: readonly { orgId: string; projectId: string }[],
  last: { orgId: string; projectId: string } | null,
): string {
  const open = (project: { orgId: string; projectId: string }) => `/orgs/${project.orgId}/projects/${project.projectId}`;
  if (last && projects.some((project) => project.orgId === last.orgId && project.projectId === last.projectId)) return open(last);
  if (projects.length === 1) return open(projects[0]!);
  return '/dashboard';
}
