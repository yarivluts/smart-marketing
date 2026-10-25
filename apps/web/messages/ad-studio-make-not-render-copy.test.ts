import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Tree = { [key: string]: string | Tree };

function strings(tree: Tree, skip: string[] = [], path = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const here = path ? `${path}.${key}` : key;
    if (skip.includes(here)) return [];
    return typeof value === 'string' ? [[here, value] as [string, string]] : strings(value, skip, here);
  });
}

// The admin panel is for the person who runs the deployment, not for a newcomer.
const ADMIN = ['admin'];

describe('Ad Studio says "make" instead of "render"', () => {
  it('has no "render" in what a newcomer reads (English)', () => {
    for (const [key, text] of strings(en.AdStudio as Tree, ADMIN)) {
      // "rendered" is also the name of an ICU argument, not text.
      expect(text.replace(/\{[^}]*\}/g, ''), key).not.toMatch(/render/i);
    }
  });

  it('has no Hebrew render loanwords (רנדר / רינדור)', () => {
    for (const [key, text] of strings(he.AdStudio as Tree, ADMIN)) {
      expect(text, key).not.toMatch(/רנד|רינד|מרונד/);
    }
  });

  it('keeps the buttons short and in plain words', () => {
    expect(en.AdStudio.video.render).toBe('Make ({seconds}s)');
    expect(en.AdStudio.video.rerender).toBe('Make again ({seconds}s)');
    expect(en.AdStudio.images.render).toBe('Make');
    expect(he.AdStudio.video.rerender).toBe('יצירה מחדש ({seconds} שנ׳)');
    expect(he.AdStudio.images.state.generating).toBe('בהכנה');
  });
});
