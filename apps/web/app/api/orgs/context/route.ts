import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { isActiveMembershipStatus } from '@/lib/orgs/membership-status';
import { listOrgProjects } from '@/lib/orgs/queries';
import { parseProjectProfile } from '@/lib/projects/project-profile';

/**
 * Feeds the client-side `OrgProvider`/`PermissionProvider` (see
 * `lib/orgs/org-context.tsx`, `lib/providers/app-providers.tsx`) with the
 * signed-in user's platform-wide id, org memberships (for the org switcher),
 * and role bindings (for real, non-empty permission checks) — this is the
 * KAN-25 fix for the `NO_BINDINGS` placeholder KAN-21/24 left behind.
 */
export async function GET(): Promise<NextResponse> {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ userId: null, memberships: [], bindings: [] });
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);

  const membershipsWithProjects = await Promise.all(
    memberships.map(async (m) => {
      if (!isActiveMembershipStatus(m.status)) {
        return m;
      }
      try {
        const rawProjects = await listOrgProjects(m.organizationId);
        const projects = rawProjects.map((p) => {
          const profile = parseProjectProfile(p);
          return {
            id: p.id,
            name: p.name,
            platformType: profile.platformType,
            businessModel: profile.businessModel,
            primaryStack: profile.primaryStack,
            verifiedRequirements: p.verified_requirements || [],
          };
        });
        return { ...m, projects };
      } catch {
        return m;
      }
    }),
  );

  return NextResponse.json({ userId: user.id, memberships: membershipsWithProjects, bindings });
}
