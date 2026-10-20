import { describe, expect, it } from 'vitest';
import { chooseStartPath } from './start-path';
import { parseLastProject, projectFromPath } from './last-project';

const A = { orgId: 'o1', projectId: 'p1' };
const B = { orgId: 'o2', projectId: 'p2' };

describe('where signing in lands', () => {
  it('goes back to the project opened last, while the person can still open it', () => {
    expect(chooseStartPath([A, B], B)).toBe('/orgs/o2/projects/p2');
    // No longer theirs (left the org, project deleted): not that one.
    expect(chooseStartPath([A, B], { orgId: 'o3', projectId: 'p3' })).toBe('/dashboard');
  });

  it('goes to the only project, and to the overview when there are several or none', () => {
    expect(chooseStartPath([A], null)).toBe('/orgs/o1/projects/p1');
    expect(chooseStartPath([A, B], null)).toBe('/dashboard');
    expect(chooseStartPath([], null)).toBe('/dashboard');
  });
});

describe('the last-project cookie', () => {
  it('reads a project from a page path and from the cookie, and nothing else', () => {
    expect(projectFromPath('/orgs/o1/projects/p1')).toEqual(A);
    expect(projectFromPath('/orgs/o1/projects/p1/ad-studio')).toEqual(A);
    expect(projectFromPath('/orgs/o1')).toBeNull();
    expect(projectFromPath('/orgs/o1/projects/new')).toEqual({ orgId: 'o1', projectId: 'new' });
    expect(parseLastProject('o1/p1')).toEqual(A);
    for (const bad of [undefined, null, '', 'o1', 'o1/p1/x', '../x/y', 'o1/p 1']) expect(parseLastProject(bad)).toBeNull();
  });
});
