import { MathGenerator } from './math.generator';
import { SeededRng } from '../util/seeded-rng';
import { ChallengeType } from '../types/challenge-type.enum';
import { GeneratedChallenge } from '../types/challenge.interface';

/** Evaluate the displayed expression using its unicode operators. */
function evalExpression(expression: string): number {
  const normalized = expression
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-');
  // eslint-disable-next-line no-eval
  return eval(normalized) as number;
}

describe('MathGenerator', () => {
  const gen = new MathGenerator();

  const generate = (seed: string, difficulty = 3, index = 0): GeneratedChallenge =>
    gen.generate(new SeededRng(seed), difficulty, index);

  it('is the MATH type', () => {
    expect(gen.type).toBe(ChallengeType.MATH);
  });

  it('generates deterministically for the same seed', () => {
    expect(generate('m:0')).toEqual(generate('m:0'));
  });

  it("the stated answer matches the expression's real value, across difficulties", () => {
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < 50; i++) {
        const c = generate(`lvl:${level}:${i}`, level, i);
        expect(c.answer).toBe(evalExpression((c.prompt as { expression: string }).expression));
      }
    }
  });

  it('division problems always have integer answers', () => {
    for (let i = 0; i < 200; i++) {
      const c = generate(`div:${i}`, 10, i); // level 10 enables ÷
      if ((c.prompt as { op: string }).op === '÷') {
        expect(Number.isInteger(c.answer)).toBe(true);
      }
    }
  });

  it('subtraction answers are never negative', () => {
    for (let i = 0; i < 200; i++) {
      const c = generate(`sub:${i}`, 2, i); // level <= 2 is + and - only
      expect(c.answer as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('validate accepts the right answer and rejects a wrong one', () => {
    const c = generate('validate');
    expect(gen.validate(c, c.answer)).toBe(true);
    expect(gen.validate(c, (c.answer as number) + 1)).toBe(false);
    expect(gen.validate(c, 'not-a-number')).toBe(false);
  });

  it('validate coerces numeric strings (form inputs arrive as strings)', () => {
    const c = generate('coerce');
    expect(gen.validate(c, String(c.answer))).toBe(true);
  });

  it('scores wrong = 0, and faster-correct > slower-correct > 0', () => {
    const c = generate('score');
    const wrong = gen.score(c, (c.answer as number) + 1, 500);
    const fast = gen.score(c, c.answer, 200);
    const slow = gen.score(c, c.answer, c.timeLimitMs - 1);
    expect(wrong).toBe(0);
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeLessThanOrEqual(c.maxScore);
  });
});
