import { DuelResolution } from './duel-resolver';

export type Tier = 'free' | 'staked';

export interface DuelAward {
  seasonPoints: number;
  xp: number;
}

const SP = {
  win:         { free: 40, staked: 60 },
  forfeitWin:  { free: 20, staked: 30 },
  loss:        { free: 5,  staked: 8  },
  forfeitLoss: { free: 0,  staked: 0  },
  draw:        { free: 10, staked: 15 },
};

const XP = { win: 60, forfeitWin: 30, loss: 25, forfeitLoss: 5, draw: 40 };

const STREAK_BONUS_PER_WIN = 5;
const STREAK_BONUS_CAP     = 25;
const FREE_SP_SOFT_CAP_WINS = 15;

export const FIRST_DUEL_DAY_XP = 50;

export function awardFor(p: {
  isWinner: boolean;
  resolution: DuelResolution;
  forfeited: boolean;   // did THIS player forfeit
  staked: boolean;
  consecutiveWinsAfterThis: number;
  freeWinsToday: number; // free-duel wins today BEFORE this one
}): DuelAward {
  const tier: Tier = p.staked ? 'staked' : 'free';

  if (p.resolution === 'draw') {
    return { seasonPoints: SP.draw[tier], xp: XP.draw };
  }

  if (p.isWinner) {
    const forfeitWin = p.resolution === 'forfeit';
    let sp = forfeitWin ? SP.forfeitWin[tier] : SP.win[tier];
    const xp = forfeitWin ? XP.forfeitWin : XP.win;

    if (!forfeitWin && p.consecutiveWinsAfterThis > 2) {
      sp += Math.min((p.consecutiveWinsAfterThis - 2) * STREAK_BONUS_PER_WIN, STREAK_BONUS_CAP);
    }
    if (!p.staked && p.freeWinsToday >= FREE_SP_SOFT_CAP_WINS) {
      sp = Math.round(sp / 2);
    }
    return { seasonPoints: sp, xp };
  }

  // loser
  return p.forfeited
    ? { seasonPoints: SP.forfeitLoss[tier], xp: XP.forfeitLoss }
    : { seasonPoints: SP.loss[tier], xp: XP.loss };
}

// ─── Level curve ─────────────────────────────────────────────────────────────

export const LEVEL_BASE   = 300;
export const LEVEL_GROWTH = 1.05;
export const MAX_LEVEL    = 100;

export function levelCost(level: number): number {
  return Math.round(LEVEL_BASE * Math.pow(LEVEL_GROWTH, level - 1));
}

// Cumulative XP thresholds: CUMULATIVE[i] = total XP needed to reach level i+1
export const CUMULATIVE: number[] = (() => {
  const arr = [0];
  let total = 0;
  for (let l = 1; l < MAX_LEVEL; l++) {
    total += levelCost(l);
    arr.push(total);
  }
  return arr;
})();

export function levelFromXp(totalXp: number): {
  level: number;
  intoLevel: number;
  nextLevelAt: number | null;
} {
  let level = 1;
  for (let l = 0; l < CUMULATIVE.length; l++) {
    if (totalXp >= CUMULATIVE[l]) level = l + 1;
    else break;
  }
  level = Math.min(level, MAX_LEVEL);
  const floor = CUMULATIVE[level - 1];
  const nextLevelAt = level >= MAX_LEVEL ? null : CUMULATIVE[level];
  return { level, intoLevel: totalXp - floor, nextLevelAt };
}

// ─── Season ──────────────────────────────────────────────────────────────────

/** Returns the current season id in YYYY-MM format. */
export function currentSeasonId(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
