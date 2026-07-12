import { DuelResolution } from '../duels/duel-resolver';

/**
 * Minimum plausible time to answer a single challenge. Submissions faster than
 * this are treated as invalid: they are stored with score 0 and isCorrect=false
 * (a human cannot read + answer a challenge in under a quarter second, so this
 * is almost certainly an automated/replayed submission).
 */
export const MIN_PLAUSIBLE_ELAPSED_MS = 250;

export interface AsyncAnswerLike {
  index: number;
  isCorrect: boolean;
  score: number;
  elapsedMs: number;
}

export interface RunTotals {
  score: number;
  correct: number;
  elapsedMs: number;
}

/** Sum a single player's validated run into score / correct-count / total time. */
export function sumRun(answers: AsyncAnswerLike[]): RunTotals {
  return answers.reduce<RunTotals>(
    (acc, a) => ({
      score: acc.score + a.score,
      correct: acc.correct + (a.isCorrect ? 1 : 0),
      elapsedMs: acc.elapsedMs + a.elapsedMs,
    }),
    { score: 0, correct: 0, elapsedMs: 0 },
  );
}

export interface ResolvedAsyncDuel {
  winnerId: string | null;
  loserId: string | null;
  resolution: DuelResolution;
  tiebreakDeltaMs: number;
  isTie: boolean;
}

export interface ResolveAsyncDuelParams {
  creatorId: string;
  opponentId: string;
  creatorScore: number;
  opponentScore: number;
  creatorElapsedMs: number;
  opponentElapsedMs: number;
}

/**
 * Higher total score wins. Tie on score → faster total elapsed time wins.
 * Identical score AND identical time → draw.
 */
export function resolveAsyncDuel(params: ResolveAsyncDuelParams): ResolvedAsyncDuel {
  const {
    creatorId,
    opponentId,
    creatorScore,
    opponentScore,
    creatorElapsedMs,
    opponentElapsedMs,
  } = params;

  if (creatorScore > opponentScore) {
    return {
      winnerId: creatorId,
      loserId: opponentId,
      resolution: 'score',
      tiebreakDeltaMs: 0,
      isTie: false,
    };
  }
  if (opponentScore > creatorScore) {
    return {
      winnerId: opponentId,
      loserId: creatorId,
      resolution: 'score',
      tiebreakDeltaMs: 0,
      isTie: false,
    };
  }

  // Tied score → fastest total time wins.
  if (creatorElapsedMs !== opponentElapsedMs) {
    const creatorFaster = creatorElapsedMs < opponentElapsedMs;
    return {
      winnerId: creatorFaster ? creatorId : opponentId,
      loserId: creatorFaster ? opponentId : creatorId,
      resolution: 'speed_tiebreak',
      tiebreakDeltaMs: Math.abs(creatorElapsedMs - opponentElapsedMs),
      isTie: false,
    };
  }

  // Identical score and time → true draw.
  return { winnerId: null, loserId: null, resolution: 'draw', tiebreakDeltaMs: 0, isTie: true };
}
