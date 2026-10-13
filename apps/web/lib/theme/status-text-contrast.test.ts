import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config';

// Status colours (success, warning, destructive) are bright fills, too light to read as small text.
// text-* utilities use a darker text token instead; this pins both the wiring and WCAG AA (4.5:1).

const css = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');

function token(block: 'light' | 'dark', name: string): [number, number, number] {
  const start = block === 'light' ? css.indexOf(':root') : css.indexOf('.dark {');
  const body = css.slice(start, css.indexOf('}', start));
  const match = body.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!match) throw new Error(`--${name} missing in ${block}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function rgb([h, s, l]: [number, number, number]): number[] {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)].map((v) => v * 255);
}

function contrast(a: number[], b: number[]): number {
  const lum = (c: number[]) => {
    const [r, g, bl] = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const tint = (fill: number[], ground: number[], alpha: number) => fill.map((v, i) => v * alpha + ground[i] * (1 - alpha));

describe('status colours as text', () => {
  it('compile text-* to the text tokens while fills keep the bright tone', async () => {
    const out = await postcss([
      tailwind({ ...config, content: [{ raw: 'text-success text-warning text-destructive text-warning/80 bg-success bg-warning/10 text-success-foreground', extension: 'html' }] }),
    ]).process('@tailwind utilities;', { from: undefined });
    const rule = (name: string) => out.css.match(new RegExp(`\\.${name.replace('/', '\\\\/')} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('text-success')).toContain('var(--success-text)');
    expect(rule('text-warning')).toContain('var(--warning-text)');
    expect(rule('text-destructive')).toContain('var(--destructive-text)');
    expect(rule('text-warning/80')).toContain('var(--warning-text)');
    expect(rule('bg-success')).toContain('var(--success)');
    expect(rule('bg-success')).not.toContain('success-text');
    expect(rule('text-success-foreground')).toContain('var(--success-foreground)');
  });

  it('reads at 4.5:1 or better on cards, the page and their own light tints, in both themes', () => {
    const white = rgb(token('light', 'card'));
    for (const name of ['success', 'warning', 'destructive']) {
      const text = rgb(token('light', `${name}-text`));
      const fill = rgb(token('light', name));
      for (const ground of [white, rgb(token('light', 'background')), tint(fill, white, 0.15)]) {
        expect(contrast(text, ground), `${name} light`).toBeGreaterThanOrEqual(4.5);
      }
      const darkText = rgb(token('dark', `${name}-text`));
      for (const ground of [rgb(token('dark', 'card')), rgb(token('dark', 'background'))]) {
        expect(contrast(darkText, ground), `${name} dark`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
