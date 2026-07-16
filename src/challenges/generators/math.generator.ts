import { ChallengeGenerator } from './challenge-generator.interface';
import { ChallengeType } from '../types/challenge-type.enum';
import { GeneratedChallenge } from '../types/challenge.interface';
import { SeededRng } from '../util/seeded-rng';

type Op = '+' | '-' | '×' | '÷';

const MAX_SCORE = 1000;
/** A correct-but-slow answer still earns this fraction of max score. */
const SPEED_FLOOR = 0.4;

/**
 * Mental-arithmetic challenges. Fully deterministic and self-checking, so there
 * is no content treadmill and nothing for anyone to call "wrong" or "corny" —
 * 12 × 7 is 12 × 7. Difficulty (1..10) scales the operators and operand ranges.
 */
export class MathGenerator implements ChallengeGenerator {
  readonly type = ChallengeType.MATH;

  generate(rng: SeededRng, difficulty: number, index: number): GeneratedChallenge {
    // Escalate within a run: start at the base difficulty and ramp up ~0.6/level
    // per question, so a 10-question set climbs from the base toward the hard cap
    // (10). Keeps the opener approachable but ends genuinely challenging.
    const level = clampDifficulty(difficulty + Math.floor(index * 0.6));
    const op = rng.pick(this.opsFor(level));
    const { expression, answer } = this.build(rng, level, op);

    return {
      index,
      type: this.type,
      difficulty: level,
      answerType: 'number',
      prompt: { expression, op },
      answer,
      maxScore: MAX_SCORE,
      timeLimitMs: this.timeLimitMs(level),
    };
  }

  validate(challenge: GeneratedChallenge, submitted: unknown): boolean {
    const value = typeof submitted === 'number' ? submitted : Number(submitted);
    return Number.isFinite(value) && value === challenge.answer;
  }

  score(challenge: GeneratedChallenge, submitted: unknown, elapsedMs: number): number {
    if (!this.validate(challenge, submitted)) return 0;
    const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
    const speedRatio = Math.max(0, 1 - elapsed / challenge.timeLimitMs);
    return Math.round(challenge.maxScore * (SPEED_FLOOR + (1 - SPEED_FLOOR) * speedRatio));
  }

  private opsFor(level: number): Op[] {
    if (level <= 2) return ['+', '-'];
    if (level <= 6) return ['+', '-', '×'];
    return ['+', '-', '×', '÷'];
  }

  private build(rng: SeededRng, level: number, op: Op): { expression: string; answer: number } {
    switch (op) {
      case '+': {
        const max = 10 * level + 5;
        const a = rng.nextInt(1, max);
        const b = rng.nextInt(1, max);
        return { expression: `${a} + ${b}`, answer: a + b };
      }
      case '-': {
        const max = 10 * level + 5;
        const a = rng.nextInt(1, max);
        const b = rng.nextInt(1, a); // keep the answer non-negative
        return { expression: `${a} − ${b}`, answer: a - b };
      }
      case '×': {
        const a = rng.nextInt(2, level + 2);
        const b = rng.nextInt(2, 2 + level * 2);
        return { expression: `${a} × ${b}`, answer: a * b };
      }
      case '÷': {
        // Build from a clean product so the answer is always an integer.
        const divisor = rng.nextInt(2, level + 2);
        const quotient = rng.nextInt(2, level + 3);
        return { expression: `${divisor * quotient} ÷ ${divisor}`, answer: quotient };
      }
    }
  }

  private timeLimitMs(level: number): number {
    // Harder problems get a little more time, capped at 12s.
    return Math.min(12000, 5000 + level * 600);
  }
}

function clampDifficulty(difficulty: number): number {
  if (!Number.isFinite(difficulty)) return 1;
  return Math.max(1, Math.min(10, Math.round(difficulty)));
}
