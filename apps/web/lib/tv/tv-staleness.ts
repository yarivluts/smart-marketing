/**
 * How long a war-room TV may go without a successful manifest fetch before it
 * has to say so on screen (KAN-172).
 *
 * Both fetch paths on this surface swallow their errors on purpose, and that is
 * the right call for a transient blip: the rotation screen's board fetch and
 * `tv-app`'s manifest poll each leave the last good data up and retry on the
 * next tick, rather than flashing an error over a wall display because one
 * request timed out.
 *
 * What neither does is distinguish a blip from an outage. A TV whose token has
 * expired, or whose network died, or whose project's API is down, keeps showing
 * the numbers it last managed to load — indefinitely, and identically to a
 * healthy one. Nobody is sitting at a wallboard to notice a missing spinner,
 * which is exactly why this surface needs the signal more than a desktop page
 * does, not less.
 *
 * It matters most for the goals and leaderboard frames. A board tile carries
 * its own freshness badge (`BoardTileView`, KAN-69), whose timestamp visibly
 * ages, so a frozen board is at least legible on close inspection. Goals and
 * the collections leaderboard ride along in the manifest and have no such
 * signal at all — and they are the motivational frames. A thermometer frozen
 * just short of target, or a leaderboard frozen with yesterday's name on top,
 * is not a neutral stale number: it is a wrong statement about people, left up
 * in front of them.
 */

/**
 * Missed polls tolerated before the display is called stale.
 *
 * One missed poll is ordinary — a Wi-Fi hiccup on an office TV, a redeploy
 * rolling the API. Three in a row is ~4.5 minutes of silence, which no longer
 * looks like weather. Set low enough that a genuinely broken TV is caught
 * within minutes, high enough that a healthy one never cries wolf: a staleness
 * warning that appears during normal operation is one the room learns to
 * ignore, which would cost more than showing nothing.
 */
export const TV_STALE_AFTER_MISSED_POLLS = 3;

/**
 * Whether the display should warn that it is no longer updating.
 *
 * `lastSuccessAt` is the timestamp of the last SUCCESSFUL manifest fetch, not
 * the last attempt — an attempt that failed is precisely the thing being
 * measured, so counting it would make a permanently broken TV look permanently
 * fresh.
 *
 * `null` means nothing has ever loaded, which is the first-paint state and not
 * staleness; the screen is already showing its own loading state then, and
 * warning on top of it would be noise.
 */
export function isTvDisplayStale(lastSuccessAt: number | null, now: number, pollIntervalMs: number): boolean {
  if (lastSuccessAt === null) {
    return false;
  }
  // `+ 1` because the first poll after a success is the one expected to land:
  // tolerating N *missed* polls means allowing N+1 intervals to elapse.
  return now - lastSuccessAt > pollIntervalMs * (TV_STALE_AFTER_MISSED_POLLS + 1);
}

/** Whole minutes since the last successful fetch, for the on-screen message — rounded down, so it never overstates how stale the data is. */
export function minutesSinceLastUpdate(lastSuccessAt: number, now: number): number {
  return Math.max(0, Math.floor((now - lastSuccessAt) / 60_000));
}
