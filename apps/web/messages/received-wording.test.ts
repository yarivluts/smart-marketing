import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Bag = Record<string, any>;

function collect(o: Bag, key: string, out: string[] = []): string[] {
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string' && k === key) out.push(v);
    else if (v && typeof v === 'object') collect(v, key, out);
  }
  return out;
}

describe('data pages say "received" / "came in" instead of "landed"', () => {
  const keys = [
    'kpiWeekEventsSub',
    'volumeChartEmpty',
    'flowWarehouseSub',
    'arrivalsHourly',
    'arrivalsDaily',
  ];
  it('English avoids "landed" in these labels', () => {
    for (const k of keys) {
      const v = collect(en as Bag, k);
      expect(v.length).toBeGreaterThan(0);
      for (const s of v) expect(s).not.toMatch(/land/i);
    }
  });
  it('English cancellation trend says came in', () => {
    const v = collect(en as Bag, 'trendDescription').join('|');
    expect(v).not.toMatch(/cancellation landed/);
  });
  it('Hebrew uses נקלטו, not the odd נחתו', () => {
    for (const k of keys) for (const s of collect(he as Bag, k)) expect(s).not.toContain('נחתו');
    expect(collect(he as Bag, 'flowWarehouseSub')[0]).toContain('נקלטו');
  });
});
