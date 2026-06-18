export interface ProgressionConfigValues {
  // ── Level (XP) ─────────────────────────────────────────────────────────────
  levelBase: number;
  levelGrowth: number;
  maxLevel: number;
  firstDuelOfDayBonusXp: number;
  xpWin: number;
  xpForfeitWin: number;
  xpDraw: number;
  xpLoss: number;
  xpForfeitLoss: number;
  xpStreakBonusPerWin: number;
  xpStreakBonusCap: number;

  // ── Tournament XP ──────────────────────────────────────────────────────────
  tournamentXpCompletion: number;
  tournamentXpPerCorrect: number;
  tournamentXpAccuracyBonus: number;
  tournamentXpAccuracyThreshold: number;

  // ── Duel Rank points (signed: losses are negative) ─────────────────────────
  duelRankWinFree: number;
  duelRankWinStaked: number;
  duelRankForfeitWinFree: number;
  duelRankForfeitWinStaked: number;
  duelRankDrawFree: number;
  duelRankDrawStaked: number;
  duelRankLossFree: number;
  duelRankLossStaked: number;
  duelRankForfeitLossFree: number;
  duelRankForfeitLossStaked: number;
  duelRankStreakBonusPerWin: number;
  duelRankStreakBonusCap: number;
  duelRankFreeSoftCapWins: number;

  // ── Demotion shield ────────────────────────────────────────────────────────
  demotionShieldBuffer: number;

  // ── Tournament Rank (percentile decay: topAward * (1 - pct)^k) ────────────
  tournamentRankTopAward: number;
  tournamentRankDecayK: number;
  tournamentRankParticipationFloor: number;

  // ── Season reset: tier name → starting points in next season ──────────────
  seasonResetPoints: Record<string, number>;

  // ── Milestone levels ───────────────────────────────────────────────────────
  levelMilestones: number[];
}

export const DEFAULT_PROGRESSION_CONFIG: ProgressionConfigValues = {
  levelBase: 300,
  levelGrowth: 1.05,
  maxLevel: 100,
  firstDuelOfDayBonusXp: 50,
  xpWin: 60,
  xpForfeitWin: 30,
  xpDraw: 40,
  xpLoss: 25,
  xpForfeitLoss: 5,
  xpStreakBonusPerWin: 5,
  xpStreakBonusCap: 25,

  tournamentXpCompletion: 20,
  tournamentXpPerCorrect: 5,
  tournamentXpAccuracyBonus: 30,
  tournamentXpAccuracyThreshold: 0.8,

  duelRankWinFree: 40,
  duelRankWinStaked: 60,
  duelRankForfeitWinFree: 20,
  duelRankForfeitWinStaked: 30,
  duelRankDrawFree: 10,
  duelRankDrawStaked: 15,
  duelRankLossFree: -20,
  duelRankLossStaked: -30,
  duelRankForfeitLossFree: -10,
  duelRankForfeitLossStaked: -15,
  duelRankStreakBonusPerWin: 5,
  duelRankStreakBonusCap: 25,
  duelRankFreeSoftCapWins: 15,

  demotionShieldBuffer: 100,

  tournamentRankTopAward: 200,
  tournamentRankDecayK: 1.5,
  tournamentRankParticipationFloor: 10,

  seasonResetPoints: {
    Legend: 4000,
    Champion: 1500,
    Gladiator: 500,
    Challenger: 0,
    Spectator: 0,
  },

  levelMilestones: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
};
