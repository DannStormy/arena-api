/**
 * Pure daily-streak math, kept separate from DB I/O so it can be unit-tested
 * exhaustively. All dates are handled as UTC calendar days (YYYY-MM-DD), which
 * is DST-safe and deterministic.
 */

/** UTC calendar day key, e.g. "2026-07-12". */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

export interface StreakState {
  currentDailyStreak: number;
  longestDailyStreak: number;
  lastPlayedOn: string | null;
}

export interface StreakUpdate extends StreakState {
  /** True if this activity changed the state (i.e. first play of a new day). */
  changed: boolean;
  /** True if the user had already played earlier today. */
  alreadyPlayedToday: boolean;
}

/**
 * Given prior streak state and "now", compute the next state after one play.
 * - same day        → no change (already counted today)
 * - yesterday       → extend the streak (+1)
 * - older / never   → reset the streak to 1
 */
export function computeNextStreak(prev: StreakState, now: Date): StreakUpdate {
  const today = toDateKey(now);
  const last = prev.lastPlayedOn;

  if (last === today) {
    return { ...prev, changed: false, alreadyPlayedToday: true };
  }

  const continued = last !== null && last === addDaysKey(today, -1);
  const currentDailyStreak = continued ? prev.currentDailyStreak + 1 : 1;
  const longestDailyStreak = Math.max(prev.longestDailyStreak, currentDailyStreak);

  return {
    currentDailyStreak,
    longestDailyStreak,
    lastPlayedOn: today,
    changed: true,
    alreadyPlayedToday: false,
  };
}

/**
 * A streak is "at risk" of breaking when the last play was yesterday and the
 * user hasn't played yet today — the UI uses this to nudge them back.
 */
export function streakStatus(state: StreakState, now: Date) {
  const today = toDateKey(now);
  const playedToday = state.lastPlayedOn === today;
  const atRisk =
    !playedToday && state.currentDailyStreak > 0 && state.lastPlayedOn === addDaysKey(today, -1);
  // If they've missed more than a day, the visible streak is effectively broken.
  const brokenSinceLastPlay =
    state.lastPlayedOn !== null && state.lastPlayedOn < addDaysKey(today, -1);

  return {
    currentDailyStreak: brokenSinceLastPlay ? 0 : state.currentDailyStreak,
    longestDailyStreak: state.longestDailyStreak,
    lastPlayedOn: state.lastPlayedOn,
    playedToday,
    atRisk,
  };
}
