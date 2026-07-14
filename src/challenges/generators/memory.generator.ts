import { ChallengeGenerator } from './challenge-generator.interface';
import { ChallengeType } from '../types/challenge-type.enum';
import { GeneratedChallenge } from '../types/challenge.interface';
import { SeededRng } from '../util/seeded-rng';

const MAX_SCORE = 1000;
/** A correct-but-slow answer still earns this fraction of max score. */
const SPEED_FLOOR = 0.4;

/** 3x3 tile grid. */
const GRID_SIZE = 9;
const MIN_LEN = 3;
const MAX_LEN = 8;

/**
 * Simon-style light-sequence memory challenge. Fully deterministic: the tile
 * sequence is derived from the SeededRng only, so two players on the same
 * matchSeed flash the identical pattern and the server can re-derive the answer
 * at validation time without storing anything.
 *
 * Note: unlike math, the "answer" here is NOT a secret — the client MUST see the
 * sequence in order to flash it. It is carried in `prompt.sequence` (client-safe)
 * and mirrored into `answer` (server-only) so the generic validate/score path
 * works unchanged. The player then taps it back from memory.
 */
export class MemoryGenerator implements ChallengeGenerator {
  readonly type = ChallengeType.MEMORY;

  generate(rng: SeededRng, difficulty: number, index: number): GeneratedChallenge {
    const level = clampDifficulty(difficulty);
    const length = this.sequenceLength(level, index);

    const sequence: number[] = [];
    for (let i = 0; i < length; i++) {
      sequence.push(rng.nextInt(0, GRID_SIZE - 1));
    }

    return {
      index,
      type: this.type,
      difficulty: level,
      answerType: 'sequence',
      prompt: { sequence, gridSize: GRID_SIZE },
      // Mirrors prompt.sequence — the client-safe view strips `answer`, so the
      // client relies on prompt.sequence to flash the pattern.
      answer: sequence,
      maxScore: MAX_SCORE,
      timeLimitMs: this.timeLimitMs(length),
    };
  }

  validate(challenge: GeneratedChallenge, submitted: unknown): boolean {
    const answer = challenge.answer as number[];
    const tapped = coerceSequence(submitted);
    if (tapped === null) return false;
    return arraysEqual(tapped, answer);
  }

  score(challenge: GeneratedChallenge, submitted: unknown, elapsedMs: number): number {
    if (!this.validate(challenge, submitted)) return 0;
    const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
    const speedRatio = Math.max(0, 1 - elapsed / challenge.timeLimitMs);
    return Math.round(challenge.maxScore * (SPEED_FLOOR + (1 - SPEED_FLOOR) * speedRatio));
  }

  /**
   * Grows as the set progresses (later indices = longer sequences), nudged up a
   * little by difficulty, clamped to a memorable range.
   */
  private sequenceLength(level: number, index: number): number {
    const raw = MIN_LEN + Math.floor(index / 1) + Math.floor((level - 1) / 3);
    return Math.max(MIN_LEN, Math.min(MAX_LEN, raw));
  }

  private timeLimitMs(length: number): number {
    // Reveal + recall budget scales with how many tiles must be remembered.
    return 3000 + length * 1500;
  }
}

function clampDifficulty(difficulty: number): number {
  if (!Number.isFinite(difficulty)) return 1;
  return Math.max(1, Math.min(10, Math.round(difficulty)));
}

/** Accept a number[] or a comma-joined string ("2,0,7") and normalise to numbers. */
function coerceSequence(submitted: unknown): number[] | null {
  let parts: unknown[];
  if (Array.isArray(submitted)) {
    parts = submitted;
  } else if (typeof submitted === 'string') {
    const trimmed = submitted.trim();
    if (trimmed === '') return null;
    parts = trimmed.split(',');
  } else {
    return null;
  }

  const out: number[] = [];
  for (const p of parts) {
    const n = typeof p === 'number' ? p : Number(String(p).trim());
    if (!Number.isInteger(n)) return null;
    out.push(n);
  }
  return out;
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
