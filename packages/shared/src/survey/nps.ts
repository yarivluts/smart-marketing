import type { NpsBreakdown, NpsCategory } from './types';

/** Standard NPS thresholds: 9-10 promoter, 7-8 passive, 0-6 detractor. */
export const NPS_PROMOTER_MIN_SCORE = 9;
export const NPS_PASSIVE_MIN_SCORE = 7;

export function classifyNpsScore(score: number): NpsCategory {
  if (score >= NPS_PROMOTER_MIN_SCORE) return 'promoter';
  if (score >= NPS_PASSIVE_MIN_SCORE) return 'passive';
  return 'detractor';
}

/** Pure aggregation over a flat list of 0-10 NPS scores — no I/O, callers own fetching/filtering the raw responses. */
export function computeNpsBreakdown(scores: readonly number[]): NpsBreakdown {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const score of scores) {
    const category = classifyNpsScore(score);
    if (category === 'promoter') promoters += 1;
    else if (category === 'passive') passives += 1;
    else detractors += 1;
  }
  const totalResponses = scores.length;
  const npsScore = totalResponses === 0 ? null : Math.round(((promoters - detractors) / totalResponses) * 1000) / 10;
  return { totalResponses, promoters, passives, detractors, npsScore };
}
