/**
 * Pure date/seed helpers for the Daily Challenge, kept free of DB I/O so they can
 * be unit-tested exhaustively. Everything is a UTC calendar day (YYYY-MM-DD),
 * which is DST-safe and deterministic.
 */

/** UTC calendar day key for `now`, e.g. "2026-07-14". */
export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The deterministic seed everyone shares for a given UTC day. */
export function dailySeed(dateStr: string): string {
  return `daily:${dateStr}`;
}

/** Shift a "YYYY-MM-DD" key by `days` (may be negative), staying in UTC. */
export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Consecutive UTC dates ending at `endDate` for which a result exists.
 * Walks back one day at a time from the just-played day until the chain breaks.
 */
export function computeDailyStreak(playedDates: Iterable<string>, endDate: string): number {
  const set = new Set(playedDates);
  let streak = 0;
  let cursor = endDate;
  while (set.has(cursor)) {
    streak++;
    cursor = addDaysKey(cursor, -1);
  }
  return streak;
}
