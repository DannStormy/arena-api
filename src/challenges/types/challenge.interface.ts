import { ChallengeType } from './challenge-type.enum';

export type ChallengeAnswerType = 'number' | 'text' | 'choice';

/** Generator-specific, tiny, JSON-serialisable, and client-safe. */
export type ChallengePrompt = Record<string, unknown>;

/**
 * The client-safe challenge. It NEVER carries the answer — the answer is
 * re-derived server-side from (matchSeed, index) at validation time.
 */
export interface Challenge {
  index: number;
  type: ChallengeType;
  difficulty: number;
  answerType: ChallengeAnswerType;
  prompt: ChallengePrompt;
  maxScore: number;
  timeLimitMs: number;
}

/** Server-only. Includes the answer and is never serialised to a client. */
export interface GeneratedChallenge extends Challenge {
  answer: unknown;
}
