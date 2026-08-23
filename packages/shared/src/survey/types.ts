export type NpsCategory = 'promoter' | 'passive' | 'detractor';

export interface NpsBreakdown {
  readonly totalResponses: number;
  readonly promoters: number;
  readonly passives: number;
  readonly detractors: number;
  /**
   * `(promoters - detractors) / totalResponses * 100`, rounded to 1 decimal
   * place — the standard NPS formula. `null` when there are no responses,
   * so an empty window reads as "no data" rather than a misleading score
   * of `0`.
   */
  readonly npsScore: number | null;
}

export interface FeedbackThemeCluster {
  readonly theme: string;
  readonly commentCount: number;
  /** Up to a few example comments for this theme, in input order. */
  readonly exampleComments: readonly string[];
}
