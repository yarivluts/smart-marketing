import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from './manifest';

describe('web app manifest', () => {
  it('installs as a standalone app with the brand colours', () => {
    const value = manifest();
    expect(value).toMatchObject({ name: 'GrowthOS', short_name: 'GrowthOS', start_url: '/', scope: '/', display: 'standalone', theme_color: '#5243d5', background_color: '#fbf8ff' });
  });

  it('lists 192 and 512 icons plus a maskable one, and every file exists', () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of icons) {
      expect(existsSync(path.join(__dirname, '..', 'public', icon.src)), icon.src).toBe(true);
    }
    expect(existsSync(path.join(__dirname, 'apple-icon.png'))).toBe(true);
  });
});
