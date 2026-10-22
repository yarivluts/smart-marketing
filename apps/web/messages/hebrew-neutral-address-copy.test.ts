import { describe, expect, it } from 'vitest';
import he from './he.json';

// Singular imperatives address one gender; the rest of the Hebrew copy speaks to "you"
// in the plural ("בדקו", "נסו"), so instructions inside sentences, hints and placeholders must too.
const SINGULAR = ['הזן', 'הוסף', 'צור', 'אשר', 'הדבק', 'הסר', 'בחר', 'שאל', 'תן', 'הקלד', 'חפש'];
const WORD = new RegExp(`(?<![\\u0590-\\u05ff])(${SINGULAR.join('|')})(?![\\u0590-\\u05ff])`);
const MIN_SENTENCE_LENGTH = 15;
// Button labels and chat chips are commands in the infinitive-like imperative; "ה-AI בחר" is third person.
const EXEMPT_PATH = /Button$|chip|aiChosen/;

function collect(node: unknown, path: string, out: Array<[string, string]>) {
  if (typeof node === 'string') out.push([path, node]);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collect(v, path ? `${path}.${k}` : k, out);
  }
}

describe('Hebrew instructions speak to everyone, not one gender', () => {
  const strings: Array<[string, string]> = [];
  collect(he, '', strings);

  it('has no singular imperative inside a sentence, hint or placeholder', () => {
    const offenders = strings
      .filter(([path, text]) => text.length >= MIN_SENTENCE_LENGTH || /placeholder/i.test(path))
      .filter(([path, text]) => !EXEMPT_PATH.test(path) && WORD.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('uses the plural form in the edit-form errors', () => {
    expect(he.Automation.proposeAdEditEmptyError).toMatch(/^הזינו/);
    expect(he.Automation.proposeMetaAdSetEditEmptyError).toBe('הזינו תקציב יומי או בחרו סטטוס חדש.');
  });
});
