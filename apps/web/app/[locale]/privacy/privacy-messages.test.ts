import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import he from '@/messages/he.json';

const SECTIONS = ['collect', 'use', 'protect', 'share', 'deletion', 'contact', 'changes'] as const;

describe('privacy policy text', () => {
  it('has every section, in English and Hebrew', () => {
    for (const messages of [en.Privacy, he.Privacy]) {
      expect(messages.title.length).toBeGreaterThan(0);
      for (const section of SECTIONS) {
        expect(messages[section].title.length).toBeGreaterThan(0);
        expect(messages[section].body.length).toBeGreaterThan(40);
      }
    }
  });

  it('states the commitments Meta reviews: what is collected from Facebook, that ads start paused, and how to delete', () => {
    expect(en.Privacy.collect.body).toContain('access token issued by Meta');
    expect(en.Privacy.use.body).toContain('always created paused');
    expect(en.Privacy.deletion.body).toContain('deletes the stored token');
  });
});
