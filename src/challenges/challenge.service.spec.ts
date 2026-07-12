import { BadRequestException } from '@nestjs/common';
import { ChallengeService } from './challenge.service';
import { ChallengeMode } from './types/challenge-mode.enum';
import { ChallengeType } from './types/challenge-type.enum';
import { Challenge } from './types/challenge.interface';

function evalExpression(expression: string): number {
  const normalized = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  // eslint-disable-next-line no-eval
  return eval(normalized) as number;
}

describe('ChallengeService', () => {
  let service: ChallengeService;

  beforeEach(() => {
    service = new ChallengeService();
  });

  const base = { matchSeed: 'seed-abc', mode: ChallengeMode.SPEED_MATH, count: 10, difficulty: 3 };

  it('generates the requested number of challenges', () => {
    expect(service.generateSet(base)).toHaveLength(10);
  });

  it('never leaks the answer to the client set', () => {
    for (const c of service.generateSet(base)) {
      expect(c).not.toHaveProperty('answer');
    }
  });

  it('is deterministic: same seed/mode/difficulty produces an identical set', () => {
    expect(service.generateSet(base)).toEqual(service.generateSet(base));
  });

  it('SPEED_MATH yields only MATH challenges', () => {
    for (const c of service.generateSet(base)) {
      expect(c.type).toBe(ChallengeType.MATH);
    }
  });

  it('BRAIN_DUEL produces a valid set (mixes all registered generators)', () => {
    const set = service.generateSet({ ...base, mode: ChallengeMode.BRAIN_DUEL });
    expect(set).toHaveLength(10);
    // Only MATH is registered today, so every challenge should still be MATH.
    expect(set.every((c) => c.type === ChallengeType.MATH)).toBe(true);
  });

  it('validates a correct answer re-derived from the seed (nothing stored)', () => {
    const set: Challenge[] = service.generateSet(base);
    for (const c of set) {
      const correctAnswer = evalExpression((c.prompt as { expression: string }).expression);
      const result = service.validateSubmission({
        matchSeed: base.matchSeed,
        mode: base.mode,
        difficulty: base.difficulty,
        index: c.index,
        submitted: correctAnswer,
        elapsedMs: 300,
      });
      expect(result.correct).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    }
  });

  it('rejects a wrong answer with a zero score', () => {
    const c = service.generateSet(base)[0];
    const wrong = evalExpression((c.prompt as { expression: string }).expression) + 1;
    const result = service.validateSubmission({
      matchSeed: base.matchSeed,
      mode: base.mode,
      difficulty: base.difficulty,
      index: 0,
      submitted: wrong,
      elapsedMs: 300,
    });
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
  });

  it('two players on the same matchSeed get identical prompts', () => {
    const p1 = service.generateSet(base).map((c) => c.prompt);
    const p2 = service.generateSet(base).map((c) => c.prompt);
    expect(p1).toEqual(p2);
  });

  it('rejects bad input', () => {
    expect(() => service.generateSet({ ...base, count: 0 })).toThrow(BadRequestException);
    expect(() => service.generateSet({ ...base, count: 999 })).toThrow(BadRequestException);
    expect(() => service.generateSet({ ...base, matchSeed: '' })).toThrow(BadRequestException);
  });
});
