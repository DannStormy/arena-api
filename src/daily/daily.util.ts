/**
 * Pure date/seed helpers for the Daily Challenge, kept free of DB I/O so they can
 * be unit-tested exhaustively. Everything is a UTC calendar day (YYYY-MM-DD),
 * which is DST-safe and deterministic.
 */

import { ChallengeMode } from '../challenges/types/challenge-mode.enum';

// The daily rotates through these modes by UTC day, so the game type varies day
// to day (math one day, memory the next). Extend this list as more deterministic
// generators land (word, pattern, …) to widen the rotation.
export const DAILY_ROTATION: ChallengeMode[] = [ChallengeMode.SPEED_MATH, ChallengeMode.MEMORY];

/** UTC calendar day key for `now`, e.g. "2026-07-14". */
export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Which challenge mode the daily uses on a given UTC day — deterministic, so
 *  everyone worldwide gets the same type (and the same set) that day. */
export function dailyModeFor(dateStr: string): ChallengeMode {
  const dayNumber = Math.floor(new Date(`${dateStr}T00:00:00.000Z`).getTime() / 86_400_000);
  const len = DAILY_ROTATION.length;
  return DAILY_ROTATION[((dayNumber % len) + len) % len];
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
