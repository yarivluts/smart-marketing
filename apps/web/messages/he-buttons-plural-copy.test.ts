import { describe, expect, it } from 'vitest';
import he from './he.json';

function collect(node: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof node === 'string') out.push([path, node]);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collect(v, `${path}.${k}`, out);
  }
}

describe('Hebrew buttons speak to everyone, like the rest of the app', () => {
  const all: Array<[string, string]> = [];
  collect(he, 'he', all);

  it('has no masculine-only singular save/create/add/delete/remove/edit buttons', () => {
    const bad = all.filter(
      ([key, text]) => /(Button|Btn|Goal|Filter|Settings)$/.test(key) && /^(שמור|צור|הוסף|מחק|הסר|ערוך) /.test(text),
    );
    expect(bad).toEqual([]);
  });

  it('uses the plural imperatives', () => {
    const texts = new Set(all.map(([, t]) => t));
    for (const t of ['שמרו הגדרות', 'צרו יעד', 'הוסיפו מסנן', 'מחקו יעד', 'ערכו פריסה']) {
      expect(texts.has(t)).toBe(true);
    }
  });
});
