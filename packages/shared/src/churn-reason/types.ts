export interface CancellationReasonThemeCluster {
  readonly theme: string;
  readonly commentCount: number;
  /** Up to a few example comments for this theme, in input order. */
  readonly exampleComments: readonly string[];
}

/** One structured `reason_code`'s share of all landed cancellations in the window a caller scoped `comments`/`reasonCodes` to. */
export interface CancellationReasonCodeCount {
  readonly reasonCode: string;
  readonly count: number;
}
