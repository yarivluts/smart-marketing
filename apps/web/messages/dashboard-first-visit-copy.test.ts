import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('dashboard greeting for a first visit', () => {
  it('does not say "back" to someone who just signed up', () => {
    expect(en.DashboardPage.welcomeFirst).toContain('{email}');
    expect(en.DashboardPage.welcomeFirst).not.toMatch(/back/i);
    expect(he.DashboardPage.welcomeFirst).toContain('{email}');
    expect(he.DashboardPage.welcomeFirst).not.toBe(he.DashboardPage.welcome);
    expect(he.DashboardPage.welcomeFirst).not.toContain('השבים');
  });
});
