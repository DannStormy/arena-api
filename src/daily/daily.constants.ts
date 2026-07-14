import { ChallengeMode } from '../challenges/types/challenge-mode.enum';

/**
 * Fixed parameters for the Daily Challenge. These are constants — NOT per-request
 * inputs — so the set is identical for every player on a given day. Changing any
 * of these changes the set everyone gets, so treat them as a stable contract.
 */
export const DAILY_MODE = ChallengeMode.SPEED_MATH;
export const DAILY_COUNT = 10;
export const DAILY_DIFFICULTY = 4;

/** Modest, idempotent XP for completing the Daily Challenge (per UTC day). */
export const DAILY_XP_BONUS = 15;
