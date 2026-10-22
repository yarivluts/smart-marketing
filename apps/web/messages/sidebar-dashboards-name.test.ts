import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('Dashboards page: plain name', () => {
  it.each([
    ['en', en],
    ['he', he],
  ] as const)('%s: sidebar link, page title and heading match', (_l, messages) => {
    const m = messages as unknown as Copy;
    expect(m.Boards.metaTitle).toBe(m.OrgDetailPage.projectBoardsLink);
    expect(m.Boards.title).toContain(m.OrgDetailPage.projectBoardsLink);
    expect(m.Boards.boardsHeading).toBe(m.OrgDetailPage.projectBoardsLink);
  });

  it('en says "Dashboards", not the bare noun "Boards"', () => {
    const m = en as unknown as Copy;
    expect(m.OrgDetailPage.projectBoardsLink).toBe('Dashboards');
  });
});
