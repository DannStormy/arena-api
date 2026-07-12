import { SeededRng } from '../util/seeded-rng';
import { ChallengeType } from '../types/challenge-type.enum';
import { GeneratedChallenge } from '../types/challenge.interface';

/**
 * A pluggable source of one challenge type. Add a generator, register it in
 * ChallengeService, and it automatically becomes available to BRAIN_DUEL (and
 * to any mode that includes its type). This is the extension point for WORD,
 * PATTERN, MEMORY, and QUIZ in later milestones.
 */
export interface ChallengeGenerator {
  readonly type: ChallengeType;

  /** Deterministically build one challenge from a seeded rng. */
  generate(rng: SeededRng, difficulty: number, index: number): GeneratedChallenge;

  /** Server-side correctness check. */
  validate(challenge: GeneratedChallenge, submitted: unknown): boolean;

  /** Points for a submission, factoring in correctness and speed. */
  score(challenge: GeneratedChallenge, submitted: unknown, elapsedMs: number): number;
}
