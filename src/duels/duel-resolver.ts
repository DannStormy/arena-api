export type DuelResolution =
  | 'score'
  | 'speed_tiebreak'
  | 'sudden_death'
  | 'forfeit'
  | 'draw';

export interface ResolvedDuel {
  winnerId: string | null;
  loserId: string | null;
  resolution: DuelResolution;
  tiebreakDeltaMs: number;
}

export interface DuelAnswerLike {
  userId: string;
  isCorrect: boolean;
  timeTakenMs: number | null;
}

export interface ResolveDuelParams {
  challengerId: string;
  opponentId: string;
  challengerScore: number;
  opponentScore: number;
  answers: DuelAnswerLike[];
  forfeitedBy?: string | null;
  suddenDeathLoserId?: string | null;
}

export function resolveDuel(params: ResolveDuelParams): ResolvedDuel {
  const {
    challengerId,
    opponentId,
    challengerScore,
    opponentScore,
    answers,
    forfeitedBy,
    suddenDeathLoserId,
  } = params;

  // 1. Forfeit overrides everything, including a higher score.
  if (forfeitedBy) {
    const winnerId = forfeitedBy === challengerId ? opponentId : challengerId;
    return { winnerId, loserId: forfeitedBy, resolution: 'forfeit', tiebreakDeltaMs: 0 };
  }

  // 2. Sudden death early loss (broke first).
  if (suddenDeathLoserId) {
    const winnerId = suddenDeathLoserId === challengerId ? opponentId : challengerId;
    return { winnerId, loserId: suddenDeathLoserId, resolution: 'sudden_death', tiebreakDeltaMs: 0 };
  }

  // 3. Higher score wins.
  if (challengerScore > opponentScore) {
    return { winnerId: challengerId, loserId: opponentId, resolution: 'score', tiebreakDeltaMs: 0 };
  }
  if (opponentScore > challengerScore) {
    return { winnerId: opponentId, loserId: challengerId, resolution: 'score', tiebreakDeltaMs: 0 };
  }

  // 4. Tied score → fastest total time on correct answers wins.
  //    Equal score means equal count of correct answers, so this is apples-to-apples.
  //    null timeTakenMs is treated as 0ms within the sum.
  const correctMs = (uid: string) =>
    answers
      .filter((a) => a.userId === uid && a.isCorrect)
      .reduce((sum, a) => sum + (a.timeTakenMs ?? 0), 0);

  const cMs = correctMs(challengerId);
  const oMs = correctMs(opponentId);

  if (cMs !== oMs) {
    const challengerFaster = cMs < oMs;
    return {
      winnerId: challengerFaster ? challengerId : opponentId,
      loserId: challengerFaster ? opponentId : challengerId,
      resolution: 'speed_tiebreak',
      tiebreakDeltaMs: Math.abs(cMs - oMs),
    };
  }

  // 5. Identical score AND identical correct-answer time → true draw.
  return { winnerId: null, loserId: null, resolution: 'draw', tiebreakDeltaMs: 0 };
}
